"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { DutyChecklistTemplate, DutyChecklistTemplateInput } from "@/types/duty";

interface DutyTemplateFormModalProps {
  template?: DutyChecklistTemplate;
  onClose: () => void;
  onSave: (input: DutyChecklistTemplateInput) => Promise<void>;
}

function fromTemplate(template?: DutyChecklistTemplate): DutyChecklistTemplateInput {
  if (!template) return { name: "", description: undefined, order: 0, active: true };
  return {
    name: template.name,
    description: template.description,
    order: template.order,
    active: template.active,
  };
}

export function DutyTemplateFormModal({ template, onClose, onSave }: DutyTemplateFormModalProps) {
  const [form, setForm] = useState<DutyChecklistTemplateInput>(() => fromTemplate(template));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên đầu việc.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, name: form.name.trim() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu đầu việc mẫu.");
      setSaving(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <form
        onSubmit={submit}
        className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <h2 className="text-lg font-bold text-gray-900">
            {template ? "Chỉnh sửa đầu việc mẫu" : "Thêm đầu việc mẫu"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Tên đầu việc *</label>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className={inputClass}
              placeholder="Ví dụ: Dọn vệ sinh phòng họp"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Mô tả</label>
            <textarea
              value={form.description ?? ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value || undefined }))
              }
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Thứ tự hiển thị</label>
            <input
              type="number"
              value={form.order}
              onChange={(event) => setForm((current) => ({ ...current, order: Number(event.target.value) || 0 }))}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
            />
            Đang sử dụng
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </div>
  );
}
