// src\app\page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type UserRole = "admin" | "staff";

/** สร้างเอกสาร users/{uid} ถ้ายังไม่มี ให้ role เริ่มต้น = staff */
async function ensureUserProfile(user: User) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email ?? "",
      role: "staff" as UserRole,
      createdAt: serverTimestamp(),
    });
  }
}

export default function HomePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const userCred = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // ✅ สร้าง profile + role ถ้ายังไม่มี
      await ensureUserProfile(userCred.user);

      console.log("Login success:", userCred.user);

      router.push("/dashboard");
    } catch (err) {
      const error = err as FirebaseError;

      console.error("Login error:", error);
      let msg = "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน";

      if (error.code === "auth/user-not-found") {
        msg = "ไม่พบบัญชีผู้ใช้นี้";
      } else if (error.code === "auth/wrong-password") {
        msg = "รหัสผ่านไม่ถูกต้อง";
      } else if (error.code === "auth/invalid-email") {
        msg = "รูปแบบอีเมลไม่ถูกต้อง";
      }

      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur border border-white/60 shadow-xl shadow-indigo-100 rounded-2xl px-8 py-10 space-y-6">
        <div className="flex flex-col items-center space-y-3 text-center">
          <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 border border-sky-100">
            ระบบภายในองค์กร · Equipment Loan
          </span>
          <h1 className="text-2xl font-semibold text-slate-900">
            ระบบเบิก / กู้ยืมอุปกรณ์
          </h1>
          <p className="text-sm text-slate-500 max-w-sm">
            กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับจากผู้ดูแลระบบ เพื่อจัดการการเบิก/กู้ยืมอุปกรณ์อย่างเป็นระบบ
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">
              อีเมล
            </label>
            <input
              type="email"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">
              รหัสผ่าน
            </label>
            <input
              type="password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-white bg-linear-to-br from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-60 disabled:shadow-none transition"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </main>
  );
}
