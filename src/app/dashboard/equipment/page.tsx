"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type UserRole = "admin" | "staff";

type EquipmentRow = {
  id: string;
  name: string;
  code: string;
  unit: string;
  availableQuantity: number;
  isActive: boolean;
};

type EquipmentDocData = {
  name?: string;
  code?: string;
  unit?: string;
  availableQuantity?: number;
  isActive?: boolean;
};

type FormState = {
  id: string | null; // null = โหมดเพิ่มใหม่
  name: string;
  code: string;
  unit: string;
  availableQuantity: string; // เก็บเป็น string ในฟอร์มแล้วค่อย parse
  isActive: boolean;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  code: "",
  unit: "",
  availableQuantity: "0",
  isActive: true,
};

export default function EquipmentPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [savingForm, setSavingForm] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // ---------- ตรวจสอบ login + role ----------
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
          const data = snap.data() as { role?: UserRole } | undefined;

          if (data?.role === "admin") {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        } catch (err) {
          console.error("Check role error:", err);
          setIsAdmin(false);
          setError("โหลดข้อมูลสิทธิ์ผู้ใช้ไม่สำเร็จ");
        } finally {
          setCheckingRole(false);
        }
      })();
    });

    return () => unsub();
  }, [router]);

  // ---------- โหลดรายการอุปกรณ์ ----------
  useEffect(() => {
    if (!user || !isAdmin || checkingRole) return;
    loadEquipment();
  }, [user, isAdmin, checkingRole]);

  async function loadEquipment() {
    setLoadingList(true);
    setError(null);

    try {
      const q = query(collection(db, "equipment"));
      const snap = await getDocs(q);

      const list: EquipmentRow[] = snap.docs.map((docSnap) => {
        const data = docSnap.data() as DocumentData & EquipmentDocData;

        return {
          id: docSnap.id,
          name: (data.name as string) ?? "",
          code: (data.code as string) ?? "",
          unit: (data.unit as string) ?? "",
          availableQuantity:
            typeof data.availableQuantity === "number"
              ? data.availableQuantity
              : 0,
          isActive:
            typeof data.isActive === "boolean" ? data.isActive : true,
        };
      });

      // เรียงตามชื่อ ให้อ่านง่าย
      list.sort((a, b) => a.name.localeCompare(b.name, "th-TH"));

      setEquipment(list);
    } catch (err) {
      console.error("Load equipment error:", err);
      setError("โหลดข้อมูลอุปกรณ์ไม่สำเร็จ");
    } finally {
      setLoadingList(false);
    }
  }

  // ---------- helper ฟอร์ม ----------
  function startCreate() {
    setForm(emptyForm);
    setSuccess(null);
    setError(null);
  }

  function startEdit(eq: EquipmentRow) {
    setForm({
      id: eq.id,
      name: eq.name,
      code: eq.code,
      unit: eq.unit,
      availableQuantity: String(eq.availableQuantity),
      isActive: eq.isActive,
    });
    setSuccess(null);
    setError(null);
  }

  function handleFormChange(
    patch: Partial<Omit<FormState, "id">>
  ) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSavingForm(true);
    setError(null);
    setSuccess(null);

    try {
      const name = form.name.trim();
      const code = form.code.trim();
      const unit = form.unit.trim();
      const qty = Number(form.availableQuantity);

      if (!name) {
        setError("กรุณากรอกชื่ออุปกรณ์");
        return;
      }

      if (Number.isNaN(qty) || qty < 0) {
        setError("กรุณากรอกจำนวนคงเหลือเป็นตัวเลข 0 ขึ้นไป");
        return;
      }

      const payload = {
        name,
        code,
        unit,
        availableQuantity: qty,
        isActive: form.isActive,
      };

      if (form.id) {
        // แก้ไข
        const ref = doc(db, "equipment", form.id);
        await updateDoc(ref, payload);
        setSuccess("บันทึกการแก้ไขอุปกรณ์เรียบร้อยแล้ว");
      } else {
        // เพิ่มใหม่
        await addDoc(collection(db, "equipment"), payload);
        setSuccess("เพิ่มอุปกรณ์ใหม่เรียบร้อยแล้ว");
      }

      setForm(emptyForm);
      await loadEquipment();
    } catch (err) {
      console.error("Save equipment error:", err);
      setError("บันทึกข้อมูลอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingForm(false);
    }
  }

  async function handleToggleActive(eq: EquipmentRow) {
    if (!user) return;
    setActionLoadingId(eq.id);
    setError(null);
    setSuccess(null);

    try {
      const ref = doc(db, "equipment", eq.id);
      await updateDoc(ref, { isActive: !eq.isActive });

      setEquipment((prev) =>
        prev.map((row) =>
          row.id === eq.id ? { ...row, isActive: !row.isActive } : row
        )
      );

      setSuccess(
        `อัปเดตสถานะอุปกรณ์ "${eq.name}" เป็น ${
          !eq.isActive ? "ใช้งาน" : "ปิดใช้งาน"
        } เรียบร้อยแล้ว`
      );
    } catch (err) {
      console.error("Toggle active error:", err);
      setError("อัปเดตสถานะอุปกรณ์ไม่สำเร็จ");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(eq: EquipmentRow) {
    if (!user) return;
    const ok = window.confirm(
      `ต้องการลบอุปกรณ์ "${eq.name}" ออกจากคลังจริงหรือไม่?\n(ประวัติการเบิกที่อ้างอิงยังคงอยู่)`
    );
    if (!ok) return;

    setActionLoadingId(eq.id);
    setError(null);
    setSuccess(null);

    try {
      const ref = doc(db, "equipment", eq.id);
      await deleteDoc(ref);

      setEquipment((prev) => prev.filter((row) => row.id !== eq.id));
      setSuccess(`ลบอุปกรณ์ "${eq.name}" เรียบร้อยแล้ว`);
    } catch (err) {
      console.error("Delete equipment error:", err);
      setError("ลบอุปกรณ์ไม่สำเร็จ");
    } finally {
      setActionLoadingId(null);
    }
  }

  if (checkingAuth || checkingRole) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100">
        <p className="text-sm text-slate-600">
          กำลังตรวจสอบสิทธิ์...
        </p>
      </main>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100">
        <p className="text-sm text-red-600">
          คุณไม่มีสิทธิ์เข้าหน้านี้ (ต้องเป็นผู้ดูแลระบบ)
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 border border-sky-100">
              จัดการอุปกรณ์ในคลัง
            </span>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              จัดการอุปกรณ์ที่ใช้สำหรับเบิก / กู้ยืม
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              เพิ่ม แก้ไข ปิดใช้งาน หรือลบอุปกรณ์ที่สามารถให้พนักงานเบิก/กู้ยืมได้
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

        {/* แจ้งเตือน error / success */}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {/* Main layout: list + form */}
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          {/* List */}
          <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                รายการอุปกรณ์ในคลัง
              </h2>
              <button
                type="button"
                onClick={startCreate}
                className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                + เพิ่มอุปกรณ์ใหม่
              </button>
            </div>

            {loadingList ? (
              <p className="text-sm text-slate-500">
                กำลังโหลดรายการอุปกรณ์...
              </p>
            ) : equipment.length === 0 ? (
              <p className="text-sm text-slate-500">
                ยังไม่มีอุปกรณ์ในคลัง กรุณาเพิ่มอุปกรณ์ใหม่จากด้านขวา
              </p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {equipment.map((eq) => (
                  <div
                    key={eq.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">
                          {eq.name}
                          {eq.code ? ` (${eq.code})` : ""}
                        </p>
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border",
                            eq.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-slate-50 text-slate-500 border-slate-200",
                          ].join(" ")}
                        >
                          {eq.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        คงเหลือ:{" "}
                        <span className="font-semibold text-slate-900">
                          {eq.availableQuantity.toLocaleString("th-TH")}{" "}
                          {eq.unit || ""}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => startEdit(eq)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === eq.id}
                        onClick={() => handleToggleActive(eq)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {eq.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingId === eq.id}
                        onClick={() => handleDelete(eq)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {form.id ? "แก้ไขอุปกรณ์" : "เพิ่มอุปกรณ์ใหม่"}
            </h2>
            <p className="text-xs text-slate-600">
              ระบุชื่ออุปกรณ์ รหัส หน่วย และจำนวนคงเหลือเริ่มต้นในคลัง
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  ชื่ออุปกรณ์
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    handleFormChange({ name: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                  placeholder="เช่น Notebook, Projector, ไมโครโฟน"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  รหัสอุปกรณ์ (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) =>
                    handleFormChange({ code: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                  placeholder="เช่น EQ-001, PJ-01"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  หน่วย
                </label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) =>
                    handleFormChange({ unit: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                  placeholder="เช่น ชุด, เครื่อง, ตัว"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  จำนวนคงเหลือในคลัง (เริ่มต้น)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.availableQuantity}
                  onChange={(e) =>
                    handleFormChange({
                      availableQuantity: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    handleFormChange({ isActive: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                />
                <label
                  htmlFor="isActive"
                  className="text-xs text-slate-700"
                >
                  ให้อุปกรณ์นี้อยู่ในรายการที่เลือกเบิกได้ (Active)
                </label>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingForm}
                  className="rounded-lg bg-linear-to-r from-sky-500 to-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-indigo-100 hover:from-sky-600 hover:to-indigo-700 disabled:opacity-60"
                >
                  {savingForm
                    ? "กำลังบันทึก..."
                    : form.id
                    ? "บันทึกการแก้ไข"
                    : "เพิ่มอุปกรณ์"}
                </button>

                {form.id && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="text-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
                  >
                    ยกเลิกการแก้ไข
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
