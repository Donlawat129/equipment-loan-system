// src/app/dashboard/request/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Equipment = {
  id: string;
  name: string;
  code?: string;
  unit?: string;
  availableQuantity: number;
};

type RequestItemForm = {
  equipmentId: string;
  quantity: number | "";
  /** ข้อความที่พิมพ์ในช่องค้นหา/เลือกอุปกรณ์ของแต่ละแถว */
  keyword: string;
};

// helper วันที่วันนี้แบบ YYYY-MM-DD
function todayYMD(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function CreateRequestPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  const [items, setItems] = useState<RequestItemForm[]>([
    { equipmentId: "", quantity: 1, keyword: "" },
  ]);

  // 🔹 ฟิลด์ใหม่
  const [academicYearCode, setAcademicYearCode] = useState("");
  const [requestDate, setRequestDate] = useState(todayYMD());
  const [departmentCode, setDepartmentCode] = useState("");

  const [reason, setReason] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // แถวไหนที่กำลังเปิด dropdown อยู่ (ใช้ควบคุม auto-complete)
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  // --------- เช็ค login ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/");
      } else {
        setUser(firebaseUser);
      }
      setCheckingAuth(false);
    });

    return () => unsub();
  }, [router]);

  // --------- โหลดรายการอุปกรณ์ ----------
  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoadingEquipment(true);
      setError(null);

      try {
        const q = query(
          collection(db, "equipment"),
          where("isActive", "==", true)
        );
        const snap = await getDocs(q);

        const list: Equipment[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as DocumentData;
          return {
            id: docSnap.id,
            name: (data.name as string) ?? "",
            code: (data.code as string) ?? "",
            unit: (data.unit as string) ?? "",
            availableQuantity: (data.availableQuantity as number) ?? 0,
          };
        });

        setEquipmentList(list);
      } catch (err) {
        console.error("Load equipment error:", err);
        setError("โหลดข้อมูลอุปกรณ์ไม่สำเร็จ");
      } finally {
        setLoadingEquipment(false);
      }
    })();
  }, [user]);

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  // --------- helper จัดการแถวรายการ ----------
  function updateItem(index: number, patch: Partial<RequestItemForm>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      { equipmentId: "", quantity: 1, keyword: "" },
    ]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // 👇 ฟังก์ชันย้อนกลับไปหน้า Dashboard
  function handleBack() {
    router.push("/dashboard");
  }

  // --------- submit ฟอร์ม ----------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // ✅ validate ฟิลด์ใหม่
      if (!academicYearCode.trim()) {
        setError("กรุณากรอกรหัสปีการศึกษา");
        return;
      }
      if (!requestDate) {
        setError("กรุณาเลือกวันที่เอกสาร");
        return;
      }
      if (!departmentCode.trim()) {
        setError("กรุณากรอกรหัสแผนก");
        return;
      }

      // เช็คว่ามีแถวที่พิมพ์ keyword แต่ยังไม่เลือกอุปกรณ์ไหม
      const hasTypingButNoSelect = items.some(
        (it) =>
          it.keyword.trim() !== "" &&
          (it.equipmentId == null || it.equipmentId.trim() === "")
      );
      if (hasTypingButNoSelect) {
        setError("กรุณาเลือกอุปกรณ์จากรายการแนะนำให้ครบทุกแถว");
        return;
      }

      // 1) เตรียมรายการที่กรอกจริง (กรองแถวว่างออก โดยดูจาก equipmentId)
      const filledItems = items
        .filter(
          (it) =>
            it.equipmentId.trim() !== "" &&
            typeof it.quantity === "number" &&
            it.quantity > 0
        )
        .map((it) => ({
          equipmentId: it.equipmentId,
          quantity: it.quantity as number,
        }));

      if (filledItems.length === 0) {
        setError("กรุณาเลือกรายการอุปกรณ์อย่างน้อย 1 รายการ");
        return;
      }

      // 2) ตรวจสอบจำนวนกับสต็อกที่เหลือ
      const payloadItems = filledItems.map((it) => {
        const eq = equipmentList.find((e) => e.id === it.equipmentId);
        if (!eq) {
          throw new Error("พบรายการอุปกรณ์ไม่ถูกต้อง");
        }

        if (it.quantity > eq.availableQuantity) {
          throw new Error(
            `จำนวนที่ขอ (${it.quantity}) มากกว่าสต็อกที่เหลือของ ${eq.name} (${eq.availableQuantity})`
          );
        }

        return {
          equipmentId: eq.id,
          equipmentName: eq.name,
          code: eq.code ?? "",
          unit: eq.unit ?? "",
          quantity: it.quantity,
        };
      });

      // 3) บันทึกลง loanRequests (เพิ่มฟิลด์ใหม่ไปด้วย)
      await addDoc(collection(db, "loanRequests"), {
        userId: user.uid,
        createdByUid: user.uid,
        createdByEmail: user.email ?? "",
        status: "pending",
        items: payloadItems,
        reason: reason.trim(),
        expectedReturnDate: expectedReturnDate || null,
        createdAt: serverTimestamp(),

        // 🔹 ฟิลด์เอกสารใหม่
        academicYearCode: academicYearCode.trim(),
        requestDate, // string YYYY-MM-DD
        departmentCode: departmentCode.trim(),
      });

      setSuccess("ส่งคำขอเบิกเรียบร้อยแล้ว");

      // reset ฟอร์ม
      setItems([{ equipmentId: "", quantity: 1, keyword: "" }]);
      setReason("");
      setExpectedReturnDate("");
      setRequestDate(todayYMD());
      // ถ้าอยากเคลียร์ปี/แผนกด้วยก็ uncomment 2 บรรทัดล่างนี้
      // setAcademicYearCode("");
      // setDepartmentCode("");
    } catch (err) {
      console.error("Create request error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "บันทึกคำขอเบิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-sky-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white/80 backdrop-blur border border-white/70 shadow-xl shadow-indigo-100 rounded-2xl px-6 py-6 space-y-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="space-y-1">
            <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 border border-sky-100">
              สร้างคำขอเบิก / กู้ยืม
            </span>
            <h1 className="text-xl font-semibold text-slate-900">
              ฟอร์มสร้างคำขอเบิก / กู้ยืมอุปกรณ์
            </h1>
            <p className="text-xs text-slate-500">
              กรอกรายละเอียดเอกสาร เลือกอุปกรณ์ ระบุจำนวน และเหตุผลในการเบิก
              ก่อนส่งให้ผู้ดูแลอนุมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={handleBack}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white/80 hover:bg-slate-50 shadow-sm text-slate-700"
          >
            กลับไปหน้า Dashboard
          </button>
        </div>

        <p className="text-sm text-slate-600">
          ผู้ขอ:{" "}
          <span className="font-medium text-slate-900">{user.email}</span>
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {success && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 🔹 ส่วนข้อมูลเอกสาร (ปีการศึกษา / วันที่เอกสาร / รหัสแผนก) */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              ข้อมูลเอกสารคำขอ
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700">
                  รหัสปีการศึกษา
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-sky-200"
                  value={academicYearCode}
                  onChange={(e) => setAcademicYearCode(e.target.value)}
                  placeholder="เช่น 2568"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700">
                  วันที่เอกสาร
                </label>
                <input
                  type="date"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-sky-200"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700">
                  รหัสแผนก
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-sky-200"
                  value={departmentCode}
                  onChange={(e) => setDepartmentCode(e.target.value)}
                  placeholder="เช่น IT01, SCI-ENG"
                  required
                />
              </div>
            </div>
          </div>

          {/* รายการอุปกรณ์ (auto-complete ต่อแถว) */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                รายการอุปกรณ์
              </h2>
            </div>

            {loadingEquipment ? (
              <p className="text-sm text-gray-500">
                กำลังโหลดรายการอุปกรณ์...
              </p>
            ) : equipmentList.length === 0 ? (
              <p className="text-sm text-red-600">
                ยังไม่มีรายการอุปกรณ์ในระบบ กรุณาติดต่อผู้ดูแล
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => {
                  const selectedEq = equipmentList.find(
                    (e) => e.id === item.equipmentId
                  );

                  const displayText =
                    item.keyword ||
                    (selectedEq
                      ? `${selectedEq.name}${
                          selectedEq.code ? ` (${selectedEq.code})` : ""
                        }`
                      : "");

                  const keywordLower = item.keyword.trim().toLowerCase();

                  const suggestions =
                    keywordLower === ""
                      ? equipmentList
                      : equipmentList.filter((eq) => {
                          const name = eq.name.toLowerCase();
                          const code = (eq.code ?? "").toLowerCase();
                          return (
                            name.includes(keywordLower) ||
                            code.includes(keywordLower)
                          );
                        });

                  return (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 border rounded-md p-2 bg-white/60"
                    >
                      {/* Auto-complete input */}
                      <div className="relative flex-1 min-w-[220px]">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                          อุปกรณ์
                        </label>
                        <input
                          type="text"
                          className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={displayText}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateItem(index, {
                              keyword: val,
                              // เคลียร์ selection เดิมจนกว่าจะเลือกใหม่จาก list
                              equipmentId: "",
                            });
                            setActiveRowIndex(index);
                          }}
                          onFocus={() => setActiveRowIndex(index)}
                          onBlur={() => {
                            // หน่วงนิดนึงให้คลิกเลือก option ได้ก่อน blur
                            setTimeout(() => {
                              setActiveRowIndex((prev) =>
                                prev === index ? null : prev
                              );
                            }, 100);
                          }}
                          placeholder="พิมพ์ชื่อหรือรหัส เช่น Notebook, PJ-001"
                        />

                        {/* Dropdown suggestions */}
                        {activeRowIndex === index && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                            {suggestions.length === 0 ? (
                              <div className="px-3 py-1.5 text-xs text-slate-500">
                                ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา
                              </div>
                            ) : (
                              suggestions.map((eq) => (
                                <button
                                  type="button"
                                  key={eq.id}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-sky-50"
                                  // ใช้ onMouseDown เพื่อให้ทำงานก่อน blur
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateItem(index, {
                                      equipmentId: eq.id,
                                      keyword: `${eq.name}${
                                        eq.code ? ` (${eq.code})` : ""
                                      }`,
                                    });
                                    setActiveRowIndex(null);
                                  }}
                                >
                                  <div className="font-medium text-slate-900">
                                    {eq.name}{" "}
                                    {eq.code ? `(${eq.code})` : ""}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    คงเหลือ{" "}
                                    {eq.availableQuantity.toLocaleString(
                                      "th-TH"
                                    )}{" "}
                                    {eq.unit ?? ""}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* จำนวน */}
                      <div className="flex flex-col gap-0.5">
                        <label className="block text-[11px] font-medium text-slate-600">
                          จำนวน
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-20 border rounded-md px-2 py-1 text-sm"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(index, {
                              quantity:
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                            })
                          }
                          required
                        />
                      </div>

                      {/* หน่วย + คงเหลือ */}
                      <span className="text-xs text-gray-600">
                        {selectedEq
                          ? `${selectedEq.unit ?? ""} (คงเหลือ ${
                              selectedEq.availableQuantity
                            })`
                          : ""}
                      </span>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          className="ml-auto text-xs text-red-600 hover:text-red-700"
                        >
                          ลบรายการ
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  + เพิ่มรายการอุปกรณ์
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-4">
            {/* เหตุผล */}
            <div>
              <label className="block text-sm font-medium mb-1">
                เหตุผล/วัตถุประสงค์ในการเบิก
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring focus:ring-blue-200"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น ใช้สำหรับงานอบรม, ใช้ติดตั้งในออฟฟิศ ฯลฯ"
              />
            </div>

            {/* วันที่คาดว่าจะคืน */}
            <div>
              <label className="block text-sm font-medium mb-1">
                วันที่คาดว่าจะคืน (ถ้ามี)
              </label>
              <input
                type="date"
                className="border rounded-md px-3 py-2 text-sm"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={
                saving || loadingEquipment || equipmentList.length === 0
              }
              className="px-4 py-2 rounded-lg bg-linear-to-r from-sky-500 to-indigo-600 text-white text-sm font-medium hover:from-sky-600 hover:to-indigo-700 disabled:opacity-60 shadow-md shadow-indigo-100"
            >
              {saving ? "กำลังบันทึก..." : "ส่งคำขอเบิก"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
