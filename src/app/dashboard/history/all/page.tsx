"use client";
// src/app/dashboard/history/all/page.tsx
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type LoanStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "returned";

type LoanItem = {
  equipmentName: string;
  quantity: number;
  unit?: string;
  code?: string;
};

type LoanRow = {
  id: string;
  createdByUid: string;
  createdByEmail: string;
  items: LoanItem[];
  status: LoanStatus;
  createdAt: Date | null;
  neededDate: Date | null;
  note: string;

  academicYearCode?: string;
  requestDate?: string;
  departmentCode?: string;
};

type LoanDocData = {
  createdByUid?: string;
  createdByEmail?: string;
  items?: {
    equipmentName?: string;
    quantity?: number;
    unit?: string;
    code?: string;
  }[];
  status?: LoanStatus;
  createdAt?: Timestamp;
  expectedReturnDate?: Timestamp | string | null;
  reason?: string;

  academicYearCode?: string;
  requestDate?: string;
  departmentCode?: string;
};

type UserRole = "admin" | "staff";

const TH_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function formatThaiDate(d: Date | null): string {
  if (!d) return "-";
  const day = d.getDate();
  const month = TH_MONTH_SHORT[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

const STATUS_LABEL: Record<LoanStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ถูกยกเลิก",
  returned: "คืนเรียบร้อย",
};

const STATUS_CLASS: Record<LoanStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
  returned: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AllLoanHistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoanStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

  // ---------- เช็ค login + role = admin ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/");
        return;
      }

      setUser(firebaseUser);
      setCheckingAuth(false);
      setCheckingRole(true);

      try {
        const userRef = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() as { role?: UserRole } | undefined;

        if (data && data.role === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error("Check admin role error:", err);
        setIsAdmin(false);
      } finally {
        setCheckingRole(false);
      }
    });

    return () => unsub();
  }, [router]);

  // ---------- โหลด loanRequests ทั้งหมด (สำหรับ admin) ----------
  useEffect(() => {
    if (!user || !isAdmin || checkingRole) return;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const q = query(collection(db, "loanRequests"));
        const snap = await getDocs(q);

        const list: LoanRow[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as LoanDocData;

          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : null;

          let neededDate: Date | null = null;
          if (data.expectedReturnDate instanceof Timestamp) {
            neededDate = data.expectedReturnDate.toDate();
          } else if (
            typeof data.expectedReturnDate === "string" &&
            data.expectedReturnDate
          ) {
            const d = new Date(data.expectedReturnDate);
            neededDate = Number.isNaN(d.getTime()) ? null : d;
          }

          const items: LoanItem[] = Array.isArray(data.items)
            ? data.items.map((it) => ({
                equipmentName: it.equipmentName ?? "-",
                quantity:
                  typeof it.quantity === "number" ? it.quantity : 0,
                unit: it.unit,
                code: it.code,
              }))
            : [];

          const status: LoanStatus = data.status ?? "pending";

          return {
            id: docSnap.id,
            createdByUid: data.createdByUid ?? "",
            createdByEmail: data.createdByEmail ?? "",
            items,
            status,
            createdAt,
            neededDate,
            note: data.reason ?? "",

            academicYearCode: data.academicYearCode ?? "",
            requestDate: data.requestDate ?? "",
            departmentCode: data.departmentCode ?? "",
          };
        });

        // เรียงจากใหม่ → เก่า
        list.sort((a, b) => {
          const aTime = a.createdAt?.getTime() ?? 0;
          const bTime = b.createdAt?.getTime() ?? 0;
          return bTime - aTime;
        });

        setRows(list);
      } catch (err) {
        console.error(err);
        setError("โหลดประวัติทั้งหมดไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isAdmin, checkingRole]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // filter สถานะ
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      // filter ปีการศึกษา
      const yearFilter = academicYearFilter.trim().toLowerCase();
      if (yearFilter && !(row.academicYearCode ?? "").toLowerCase().includes(yearFilter)) {
        return false;
      }

      // filter แผนก
      const deptFilter = departmentFilter.trim().toLowerCase();
      if (deptFilter && !(row.departmentCode ?? "").toLowerCase().includes(deptFilter)) {
        return false;
      }

      // filter วันที่เริ่มต้น
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        const createdTime = row.createdAt?.getTime();
        if (createdTime == null || createdTime < from.getTime()) {
          return false;
        }
      }

      // filter วันที่สิ้นสุด
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        const createdTime = row.createdAt?.getTime();
        if (createdTime == null || createdTime > to.getTime()) {
          return false;
        }
      }

      // filter คำค้นหา
      const trimmed = searchText.trim().toLowerCase();
      if (!trimmed) return true;

      const requesterText = `${row.createdByEmail} ${row.createdByUid}`;
      const itemsText = row.items
        .map((it) => `${it.equipmentName} ${it.code ?? ""}`)
        .join(" ");
      const noteText = row.note ?? "";
      const docInfoText = `${row.academicYearCode ?? ""} ${
        row.departmentCode ?? ""
      } ${row.requestDate ?? ""}`;

      const haystack = `${requesterText} ${itemsText} ${noteText} ${docInfoText}`.toLowerCase();

      return haystack.includes(trimmed);
    });
  }, [
    rows,
    statusFilter,
    dateFrom,
    dateTo,
    searchText,
    academicYearFilter,
    departmentFilter,
  ]);

  if (checkingAuth || checkingRole) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100">
        <p className="text-sm text-slate-600">กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100">
        <p className="text-sm text-red-600">
          คุณไม่มีสิทธิ์เข้าหน้านี้ (สำหรับผู้ดูแลระบบเท่านั้น)
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-6 py-6 space-y-4">
        {/* หัวหน้า + ปุ่มกลับ */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-100">
              ประวัติทั้งหมด · Admin
            </span>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              ประวัติคำขอเบิก / กู้ยืมอุปกรณ์ (ทุกผู้ใช้)
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              ดูประวัติคำขอทั้งหมดในระบบ พร้อมฟิลเตอร์ค้นหาตามผู้ขอ ชื่ออุปกรณ์
              ปีการศึกษา แผนก สถานะ และช่วงวันที่
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              ← กลับหน้า Dashboard
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5 items-end">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ค้นหาผู้ขอ / ชื่ออุปกรณ์ / รหัส / เหตุผล / ปีการศึกษา / แผนก
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              placeholder="เช่น user@example.com, โน้ตบุ๊ก, PJ-001, 2568, IT01"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ปีการศึกษา
            </label>
            <input
              type="text"
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              placeholder="เช่น 2568"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              รหัสแผนก
            </label>
            <input
              type="text"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              placeholder="เช่น IT01"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                จากวันที่ (สร้างคำขอ)
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ถึงวันที่ (สร้างคำขอ)
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              สถานะ
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as LoanStatus | "all")
              }
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="pending">{STATUS_LABEL.pending}</option>
              <option value="approved">{STATUS_LABEL.approved}</option>
              <option value="rejected">{STATUS_LABEL.rejected}</option>
              <option value="cancelled">{STATUS_LABEL.cancelled}</option>
              <option value="returned">{STATUS_LABEL.returned}</option>
            </select>
          </div>
        </div>

        {/* เนื้อหา */}
        {loading && (
          <p className="text-sm text-slate-500">
            กำลังโหลดประวัติคำขอทั้งหมด...
          </p>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
            ยังไม่มีคำขอในระบบ
          </div>
        )}

        {!loading &&
          !error &&
          rows.length > 0 &&
          filteredRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
              ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา/ตัวกรอง
            </div>
          )}

        {!loading && !error && filteredRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    วันที่ขอ
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    ผู้ขอ / ปีการศึกษา / แผนก
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    รายการอุปกรณ์
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    สถานะ
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    วันที่เอกสาร / คาดว่าจะคืน
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    เหตุผล / หมายเหตุ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRows.map((row) => {
                  const firstItem = row.items[0];
                  const othersCount =
                    row.items.length > 1 ? row.items.length - 1 : 0;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 align-top text-xs text-slate-700">
                        {formatThaiDate(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700">
                        <div className="font-medium text-slate-900">
                          {row.createdByEmail || row.createdByUid}
                        </div>
                        {row.createdByEmail && (
                          <div className="text-[11px] text-slate-500">
                            UID: {row.createdByUid}
                          </div>
                        )}
                        {(row.academicYearCode || row.departmentCode) && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            ปีการศึกษา: {row.academicYearCode || "-"} · แผนก:{" "}
                            {row.departmentCode || "-"}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700">
                        {row.items.length === 0 && <span>-</span>}
                        {row.items.length > 0 && (
                          <>
                            <div>
                              {firstItem.equipmentName}
                              {firstItem.code
                                ? ` (${firstItem.code})`
                                : ""}{" "}
                              —{" "}
                              {firstItem.quantity.toLocaleString("th-TH")}{" "}
                              {firstItem.unit ?? ""}
                            </div>
                            {othersCount > 0 && (
                              <div className="text-[11px] text-slate-500">
                                + อีก {othersCount} รายการ
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border",
                            STATUS_CLASS[row.status],
                          ].join(" ")}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700">
                        {row.requestDate && (
                          <div className="mb-1">
                            วันที่เอกสาร: {row.requestDate}
                          </div>
                        )}
                        <div>
                          คาดว่าจะคืน:{" "}
                          {row.neededDate
                            ? formatThaiDate(row.neededDate)
                            : "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-slate-700">
                        {row.note || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
