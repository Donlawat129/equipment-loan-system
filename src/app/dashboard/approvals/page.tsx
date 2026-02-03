// src/app/dashboard/approvals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type LoanStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "returned";

type LoanItem = {
  equipmentId: string;
  equipmentName?: string;
  code?: string;
  unit?: string;
  quantity: number;
};

type LoanRequest = {
  id: string;
  createdByUid: string;
  createdByEmail?: string;
  status: LoanStatus;
  items: LoanItem[];
  reason?: string;
  expectedReturnDate?: string | null;
  createdAt?: Timestamp;

  academicYearCode?: string;
  requestDate?: string;
  departmentCode?: string;
};

type EquipmentDoc = {
  name?: string;
  availableQuantity?: number;
};

type LoanRequestDoc = {
  createdByUid: string;
  createdByEmail?: string;
  status?: LoanStatus;
  items?: LoanItem[];
  reason?: string;
  expectedReturnDate?: string | null;
  createdAt?: Timestamp;

  academicYearCode?: string;
  requestDate?: string;
  departmentCode?: string;
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // --------- เช็ค login + role ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/");
        return;
      }

      setUser(firebaseUser);
      setCheckingAuth(false);

      (async () => {
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(userRef);
          const data = snap.data() as { role?: string } | undefined;

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
      })();
    });

    return () => unsub();
  }, [router]);

  // --------- โหลดคำขอ pending ----------
  useEffect(() => {
    if (!user || !isAdmin || checkingRole) return;

    (async () => {
      setLoadingRequests(true);
      setError(null);

      try {
        const q = query(
          collection(db, "loanRequests"),
          where("status", "==", "pending")
        );
        const snap = await getDocs(q);

        const list: LoanRequest[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as LoanRequestDoc;

          return {
            id: docSnap.id,
            createdByUid: data.createdByUid,
            createdByEmail: data.createdByEmail ?? "",
            status: data.status ?? "pending",
            items: data.items ?? [],
            reason: data.reason ?? "",
            expectedReturnDate: data.expectedReturnDate ?? null,
            createdAt: data.createdAt,

            academicYearCode: data.academicYearCode ?? "",
            requestDate: data.requestDate ?? "",
            departmentCode: data.departmentCode ?? "",
          };
        });

        setRequests(list);
      } catch (err) {
        console.error("Load requests error:", err);
        setError("โหลดคำขอเบิกไม่สำเร็จ");
      } finally {
        setLoadingRequests(false);
      }
    })();
  }, [user, isAdmin, checkingRole]);

  if (checkingAuth || checkingRole) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-red-600">
          คุณไม่มีสิทธิ์เข้าหน้านี้ (ต้องเป็นผู้ดูแลระบบ)
        </p>
      </main>
    );
  }

  function formatDateTime(ts?: Timestamp): string {
    if (!ts) return "-";
    const d = ts.toDate();
    return d.toLocaleString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleApprove(req: LoanRequest) {
    if (!user) return;
    setActionLoadingId(req.id);
    setActionError(null);

    try {
      await runTransaction(db, async (tx) => {
        const reqRef = doc(db, "loanRequests", req.id);
        const reqSnap = await tx.get(reqRef);

        if (!reqSnap.exists()) {
          throw new Error("ไม่พบคำขอ (อาจถูกลบไปแล้ว)");
        }

        const reqData = reqSnap.data() as {
          status: LoanStatus;
          items: LoanItem[];
        };

        if (reqData.status !== "pending") {
          throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว");
        }

        for (const item of reqData.items) {
          const eqRef = doc(db, "equipment", item.equipmentId);
          const eqSnap = await tx.get(eqRef);

          if (!eqSnap.exists()) {
            throw new Error(
              `ไม่พบอุปกรณ์: ${item.equipmentName ?? item.equipmentId}`
            );
          }

          const eqData = eqSnap.data() as EquipmentDoc;
          const available = eqData.availableQuantity ?? 0;

          if (available < item.quantity) {
            throw new Error(
              `สต็อกของ ${
                eqData.name ?? item.equipmentName ?? item.equipmentId
              } ไม่พอ (คงเหลือ ${available})`
            );
          }

          tx.update(eqRef, {
            availableQuantity: available - item.quantity,
          });
        }

        tx.update(reqRef, {
          status: "approved",
          approvedByUid: user.uid,
          approvedAt: serverTimestamp(),
        });
      });

      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error("Approve error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "อนุมัติคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      setActionError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject(req: LoanRequest) {
    if (!user) return;
    setActionLoadingId(req.id);
    setActionError(null);

    try {
      const reqRef = doc(db, "loanRequests", req.id);
      await updateDoc(reqRef, {
        status: "rejected",
        approvedByUid: user.uid,
        approvedAt: serverTimestamp(),
      });

      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error("Reject error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "ปฏิเสธคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      setActionError(message);
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-6 py-6 space-y-4">
        {/* 👇 ส่วนหัว + ปุ่มกลับ Dashboard */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">
              อนุมัติคำขอเบิก / กู้ยืมอุปกรณ์
            </h1>
            <p className="text-sm text-gray-600">
              ผู้ดูแลระบบ: <span className="font-medium">{user.email}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            ← กลับหน้า Dashboard
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {actionError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {actionError}
          </div>
        )}

        {loadingRequests ? (
          <p className="text-sm text-gray-500">กำลังโหลดคำขอที่รออนุมัติ...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-gray-500">
            ยังไม่มีคำขอที่รออนุมัติ (pending)
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="border-l-4 border-emerald-300 rounded-xl bg-white/80 p-3 text-sm space-y-2 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      ผู้ขอ: {req.createdByEmail || req.createdByUid}
                    </div>
                    <div className="text-xs text-gray-500">
                      สร้างเมื่อ: {formatDateTime(req.createdAt)}
                    </div>
                    {(req.academicYearCode || req.departmentCode) && (
                      <div className="text-xs text-gray-500">
                        ปีการศึกษา: {req.academicYearCode || "-"} · แผนก:{" "}
                        {req.departmentCode || "-"}
                      </div>
                    )}
                    {req.requestDate && (
                      <div className="text-xs text-gray-500">
                        วันที่เอกสาร: {req.requestDate}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(req)}
                      disabled={actionLoadingId === req.id}
                      className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {actionLoadingId === req.id
                        ? "กำลังอนุมัติ..."
                        : "อนุมัติ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(req)}
                      disabled={actionLoadingId === req.id}
                      className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60"
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </div>

                {req.reason && (
                  <div>
                    <span className="font-medium">เหตุผล: </span>
                    <span>{req.reason}</span>
                  </div>
                )}

                {req.expectedReturnDate && (
                  <div className="text-xs text-gray-600">
                    วันที่คาดว่าจะคืน: {req.expectedReturnDate}
                  </div>
                )}

                <div>
                  <div className="font-medium mb-1">รายการอุปกรณ์</div>
                  <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
                    {req.items.map((item, idx) => (
                      <li key={idx}>
                        {item.equipmentName || item.equipmentId}{" "}
                        {item.code ? `(${item.code})` : ""} - {item.quantity}{" "}
                        {item.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
