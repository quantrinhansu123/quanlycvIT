"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import type { DutyRecurringRule, DutyRecurringRuleInput } from "@/types/duty";
import { DUTY_WEEKDAY_OPTIONS } from "@/types/duty";
import type { ProjectMember } from "@/types/project";
import { toDateInputValue } from "@/lib/utils";

interface DutyRuleFormModalProps {
  rule?: DutyRecurringRule;
  members: ProjectMember[];
  onClose: () => void;
  onSave: (input: DutyRecurringRuleInput) => Promise<void>;
}

function fromRule(rule?: DutyRecurringRule): DutyRecurringRuleInput {
  if (!rule) {
    return {
      weekday: 1,
      assigneeIds: [],
      startDate: new Date().toISOString().slice(0, 10),
      endDate: undefined,
      note: undefined,
      active: true,
    };
  }
  return {
    weekday: rule.weekday,
    assigneeIds: rule.assignees.map((assignee) => assignee.id),
    startDate: rule.startDate,
    endDate: rule.endDate,
    note: rule.note,
    active: rule.active,
  };
}

export function DutyRuleFormModal({ rule, members, onClose, onSave }: DutyRuleFormModalProps) {
  const [form, setForm] = useState<DutyRecurringRuleInput>(() => fromRule(rule));
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
    if (form.assigneeIds.length === 0) {
      setError("Vui lòng chọn ít nhất một người trực.");
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      setError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu quy tắc lịch trực.");
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
        className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <h2 className="text-lg font-bold text-gray-900">
            {rule ? "Chỉnh sửa quy tắc lịch trực" : "Thêm quy tắc lịch trực"}
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
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Thứ trong tuần</label>
            <select
              value={form.weekday}
              onChange={(event) => setForm((current) => ({ ...current, weekday: Number(event.target.value) }))}
              className={inputClass}
            >
              {DUTY_WEEKDAY_OPTIONS.map((weekday) => (
                <option key={weekday.value} value={weekday.value}>
                  {weekday.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Người trực</label>
            <MemberMultiSelect
              options={members}
              value={form.assigneeIds}
              onChange={(ids) => setForm((current) => ({ ...current, assigneeIds: ids }))}
              placeholder="Chọn người trực..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">Hiệu lực từ</label>
              <input
                type="date"
                value={toDateInputValue(form.startDate)}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">Hiệu lực đến (tùy chọn)</label>
              <input
                type="date"
                value={form.endDate ? toDateInputValue(form.endDate) : ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, endDate: event.target.value || undefined }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Ghi chú</label>
            <textarea
              value={form.note ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value || undefined }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
            />
            Đang áp dụng
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
