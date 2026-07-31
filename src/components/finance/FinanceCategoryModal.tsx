"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, LoaderCircle, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { Button } from "@/components/ui/Button";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";
import { cn } from "@/lib/utils";
import type { FinanceCategory, FinanceCategoryInput, FinanceType } from "@/types/finance";

interface Props {
  categories: FinanceCategory[];
  onClose: () => void;
  onSave: (input: FinanceCategoryInput, id?: string) => Promise<void>;
  onDelete: (category: FinanceCategory) => Promise<void>;
}

const emptyForm: FinanceCategoryInput = { name: "", type: "chi" };
const integerFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function formatMoneyInput(value: number | undefined) {
  return value ? integerFormatter.format(value) : "";
}

export function FinanceCategoryModal({ categories, onClose, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<FinanceCategoryInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handleKey); };
  }, [onClose, saving]);

  function edit(category: FinanceCategory) { setEditingId(category.id); setForm({ name: category.name, type: category.type, monthlyBudget: category.monthlyBudget }); setError(""); }
  function reset() { setEditingId(undefined); setForm(emptyForm); setError(""); }
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!form.name.trim()) return setError("Vui lòng nhập tên danh mục."); setSaving(true); setError(""); try { await onSave({ ...form, name: form.name.trim() }, editingId); reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu danh mục."); } finally { setSaving(false); } }
  const inputClass = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  return (
    <div className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="account-dialog flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="category-title">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6"><div><h2 id="category-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><Tags className="h-5 w-5 text-brand-600" />Quản lý danh mục</h2><p className="mt-1 text-xs text-gray-500">Phân loại giao dịch và thiết lập hạn mức chi hàng tháng</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Đóng"><X className="h-5 w-5" /></button></header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_280px]">
          <div className="order-2 min-h-0 overflow-y-auto p-4 md:order-1 md:border-r md:border-gray-100 sm:p-5">
            {categories.length === 0 ? <div className="flex h-44 flex-col items-center justify-center text-center"><Tags className="h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-600">Chưa có danh mục</p><p className="mt-1 text-xs text-gray-400">Tạo danh mục đầu tiên ở biểu mẫu bên cạnh.</p></div> : <div className="space-y-2">{categories.map((category) => <div key={category.id} className={cn("group flex items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm", editingId === category.id ? "border-brand-300 bg-brand-50" : "border-gray-200")}>
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", category.type === "thu" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>{category.type === "thu" ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1"><b className="block truncate text-sm text-gray-900">{category.name}</b><span className="text-[11px] text-gray-500">{category.type === "thu" ? "Khoản thu" : category.monthlyBudget ? `Ngân sách ${new Intl.NumberFormat("vi-VN").format(category.monthlyBudget)} đ/tháng` : "Khoản chi · Chưa đặt ngân sách"}</span></span>
              <span className="flex gap-1 opacity-70 transition group-hover:opacity-100"><ActionIconButton icon={Pencil} label="Chỉnh sửa" tone="warning" onClick={() => edit(category)} /><ActionIconButton icon={Trash2} label="Xóa danh mục" tone="danger" onClick={() => void onDelete(category)} /></span>
            </div>)}</div>}
          </div>
          <form onSubmit={submit} className="order-1 space-y-4 border-b border-gray-100 bg-gray-50/60 p-4 md:order-2 md:border-b-0 sm:p-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-gray-800">{editingId ? "Sửa danh mục" : "Thêm danh mục"}</h3>{editingId && <button type="button" onClick={reset} className="text-xs font-medium text-brand-600 hover:text-brand-700">Thêm mới</button>}</div>
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-600">Tên danh mục <span className="text-rose-500">*</span></span><input autoFocus className={inputClass} value={form.name} maxLength={100} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Ví dụ: Điện nước" /></label>
            <div className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600">Loại</span>
              <SingleSelectDropdown
                value={form.type}
                onChange={(value) => setForm((current) => ({ ...current, type: value as FinanceType, monthlyBudget: value === "thu" ? undefined : current.monthlyBudget }))}
                showSelectionIndicator={false}
                options={[
                  { value: "chi", label: "Khoản chi", dotClassName: "bg-rose-500" },
                  { value: "thu", label: "Khoản thu", dotClassName: "bg-emerald-500" },
                ]}
              />
            </div>
            {form.type === "chi" && <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-600">Ngân sách tháng</span><div className="relative"><input inputMode="numeric" className={cn(inputClass, "pr-12")} value={formatMoneyInput(form.monthlyBudget)} onChange={(e) => setForm((current) => ({ ...current, monthlyBudget: Number(e.target.value.replace(/\D/g, "")) || undefined }))} placeholder="Không bắt buộc" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">VNĐ</span></div></label>}
            {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm danh mục"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
