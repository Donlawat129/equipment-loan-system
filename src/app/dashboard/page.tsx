"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type UserRole = "admin" | "staff";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadingRole, setLoadingRole] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

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
          const ref = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data() as { role?: UserRole };
            if (data.role === "admin" || data.role === "staff") {
              setRole(data.role);
            } else {
              setRole("staff");
            }
          } else {
            setRole("staff");
          }
        } catch (error) {
          console.error("Failed to load user role:", error);
          setRoleError("โหลดข้อมูลสิทธิ์ผู้ใช้ไม่สำเร็จ");
        } finally {
          setLoadingRole(false);
        }
      })();
    });

    return () => unsub();
  }, [router]);

  if (checkingAuth || loadingRole) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100">
        <p className="text-sm text-slate-600">กำลังโหลดข้อมูลผู้ใช้...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await signOut(auth);
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="max-w-5xl mx-auto bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-8 py-6 space-y-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="space-y-1">
            <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 border border-sky-100">
              Dashboard · Equipment Loan
            </span>
            <h1 className="text-2xl font-semibold text-slate-900">
              ระบบเบิก / กู้ยืมอุปกรณ์
            </h1>
            <p className="text-sm text-slate-500">
              จัดการคำขอเบิกอุปกรณ์ สถานะการอนุมัติ และสิทธิ์ผู้ใช้งาน
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white/80 hover:bg-slate-50 shadow-sm text-slate-700"
          >
            ออกจากระบบ
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-sm text-slate-600">
            ยินดีต้อนรับ:{" "}
            <span className="font-medium text-slate-900">{user.email}</span>
          </p>

          <p className="text-sm text-slate-600">
            สิทธิ์ของคุณ:{" "}
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-100">
              {role}
            </span>
          </p>
        </div>

        {roleError && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {roleError}
          </div>
        )}

        {role === "admin" ? <AdminSection /> : <StaffSection />}
      </div>
    </main>
  );
}

function AdminSection() {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50 via-sky-50 to-indigo-50 p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          เมนูผู้ดูแลระบบ (Admin)
        </h2>
        <p className="text-sm text-slate-600">
          จัดการคำขอเบิกอุปกรณ์ อนุมัติ/ปฏิเสธ และดูภาพรวมคลังอุปกรณ์
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/approvals"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 shadow-sm"
          >
            อนุมัติคำขอเบิก / กู้ยืม
          </Link>

          <Link
            href="/dashboard/request"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-sm"
          >
            สร้างคำขอเบิกใหม่
          </Link>

          <Link
            href="/dashboard/history"
            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm"
          >
            ประวัติการเบิกของฉัน
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          สิ่งที่ผู้ดูแลระบบสามารถทำได้
        </h3>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
          <li>ดูและอนุมัติคำขอเบิก/กู้ยืมอุปกรณ์</li>
          <li>จัดการคลังอุปกรณ์ (เพิ่ม / ลด / ปรับจำนวน)</li>
          <li>จัดการสิทธิ์ผู้ใช้ (กำหนดให้ใครเป็น admin / staff)</li>
        </ul>
      </div>
    </div>
  );
}

function StaffSection() {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50 via-sky-50 to-indigo-50 p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          เมนูพนักงาน (Staff)
        </h2>
        <p className="text-sm text-slate-600">
          ส่งคำขอเบิก/กู้ยืมอุปกรณ์ และติดตามสถานะการอนุมัติของตัวเอง
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/request"
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 shadow-sm"
          >
            สร้างคำขอเบิกใหม่
          </Link>

          <Link
            href="/dashboard/history"
            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm"
          >
            ประวัติการเบิกของฉัน
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          สิ่งที่พนักงานสามารถทำได้
        </h3>
        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
          <li>สร้างคำขอเบิก/กู้ยืมอุปกรณ์</li>
          <li>ดูสถานะคำขอของตัวเอง</li>
          <li>ดูประวัติการเบิก / คืนอุปกรณ์</li>
        </ul>
      </div>
    </div>
  );
}
