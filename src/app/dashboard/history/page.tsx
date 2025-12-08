// src\app\dashboard\history\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type LoanStatus = "pending" | "approved" | "rejected" | "returned";

type LoanItem = {
  equipmentName: string;
  quantity: number;
  unit?: string;
  code?: string;
};

type LoanRow = {
  id: string;
  items: LoanItem[];
  status: LoanStatus;
  createdAt: Date | null;
  neededDate: Date | null; // map จาก expectedReturnDate
  note: string; // map จาก reason
};

type LoanDocData = {
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
};

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
  returned: "คืนเรียบร้อย",
};

const STATUS_CLASS: Record<LoanStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
  returned: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function LoanHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoanStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // กรองข้อมูลตาม search / filter / date
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // filter สถานะ
      if (statusFilter !== "all" && row.status !== statusFilter) {
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
      if (!trimmed) {
        return true;
      }

      const itemsText = row.items
        .map((it) => `${it.equipmentName} ${it.code ?? ""}`)
        .join(" ");
      const noteText = row.note ?? "";

      const haystack = `${itemsText} ${noteText}`.toLowerCase();

      return haystack.includes(trimmed);
    });
  }, [rows, statusFilter, dateFrom, dateTo, searchText]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // ✅ ใช้ loanRequests + filter ตาม createdByUid ให้ตรงกับ rules
        const q = query(
          collection(db, "loanRequests"),
          where("createdByUid", "==", user.uid)
        );

        const snap = await getDocs(q);

        const list: LoanRow[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as LoanDocData;

          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : null;

          // expectedReturnDate อาจจะเป็น Timestamp หรือ string
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
            items,
            status,
            createdAt,
            neededDate,
            note: data.reason ?? "",
          };
        });

        // เรียงล่าสุดอยู่บนสุด
        list.sort((a, b) => {
          const aTime = a.createdAt?.getTime() ?? 0;
          const bTime = b.createdAt?.getTime() ?? 0;
          return bTime - aTime;
        });

        setRows(list);
      } catch (err) {
        console.error(err);
        setError("โหลดประวัติการเบิกไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-6 py-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 border border-sky-100">
              ประวัติการเบิก / กู้ยืมอุปกรณ์
            </span>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              ประวัติการเบิก / กู้ยืมของฉัน
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              ดูรายการที่คุณเคยส่งคำขอเบิกอุปกรณ์ พร้อมสถานะอนุมัติ และรายละเอียดต่าง ๆ
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
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ค้นหาชื่ออุปกรณ์ / รหัส / เหตุผล
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              placeholder="เช่น โน้ตบุ๊ก, PJ-001 หรือ คำอธิบาย"
            />
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
              className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="pending">{STATUS_LABEL.pending}</option>
              <option value="approved">{STATUS_LABEL.approved}</option>
              <option value="rejected">{STATUS_LABEL.rejected}</option>
              <option value="returned">{STATUS_LABEL.returned}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              จากวันที่
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
            />
          </div>
        </div>

        {loading && (
          <p className="text-sm text-slate-500">
            กำลังโหลดประวัติการเบิกอุปกรณ์...
          </p>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
            ยังไม่มีประวัติการเบิก / กู้ยืมอุปกรณ์
            <br />
            คุณสามารถเริ่มต้นได้ที่ปุ่ม{" "}
            <span className="font-semibold text-blue-600">
              สร้างคำขอเบิกใหม่
            </span>{" "}
            ในหน้า Dashboard
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
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    {row.items.length === 0 ? (
                      <p className="text-sm font-semibold text-slate-900">
                        -
                      </p>
                    ) : (
                      row.items.map((it, idx) => (
                        <p
                          key={idx}
                          className="text-sm text-slate-900"
                        >
                          {it.equipmentName}
                          {it.code ? ` (${it.code})` : ""} —{" "}
                          {it.quantity.toLocaleString("th-TH")}{" "}
                          {it.unit ?? ""}
                        </p>
                      ))
                    )}
                  </div>

                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border",
                      STATUS_CLASS[row.status],
                    ].join(" ")}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>

                <div className="space-y-0.5 text-xs text-slate-500">
                  <p>
                    ขอเบิกเมื่อ:{" "}
                    <span className="font-medium text-slate-700">
                      {formatThaiDate(row.createdAt)}
                    </span>
                  </p>
                  {row.neededDate && (
                    <p>
                      วันที่คาดว่าจะคืน:{" "}
                      <span className="font-medium text-slate-700">
                        {formatThaiDate(row.neededDate)}
                      </span>
                    </p>
                  )}
                  {row.note && (
                    <p className="text-slate-600">
                      เหตุผล/หมายเหตุ: {row.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
