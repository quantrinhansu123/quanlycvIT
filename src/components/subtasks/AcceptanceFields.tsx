"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ProjectMember } from "@/types/project";
import type { AcceptanceItem, AcceptanceRow } from "@/types/subtask";
import { AcceptanceImageInput } from "@/components/subtasks/AcceptanceImageInput";

export function AcceptanceFields({
  compact = false,
  hideMembers = false,
  showItems = false,
  members,
  row,
  disabled,
  uploading,
  onSave,
  onDraftChange,
  onUpload,
}: {
  compact?: boolean;
  hideMembers?: boolean;
  showItems?: boolean;
  members: ProjectMember[];
  row: AcceptanceRow;
  disabled: boolean;
  uploading: boolean;
  onSave: (patch: Partial<AcceptanceRow>) => void | Promise<void>;
  onDraftChange?: (patch: Partial<AcceptanceRow>) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [draftEdits, setDraftEdits] = useState<Partial<AcceptanceRow> | null>(null);
  const draft = onDraftChange ? row : draftEdits ? { ...row, ...draftEdits } : row;
  const dirty = draftEdits !== null;
  const [saving, setSaving] = useState(false);

  const items = draft.items ?? [];

  function updateItem(id: string, patch: Partial<AcceptanceItem>) {
    updateDraft({ items: items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function updateDraft(patch: Partial<AcceptanceRow>) {
    if (onDraftChange) {
      onDraftChange(patch);
      return;
    }
    setDraftEdits((current) => ({ ...current, ...patch }));
  }

  async function saveDraft() {
    if (disabled || saving || !dirty) return;
    setSaving(true);
    try {
      await onSave({
        note: draft.note,
        status: draft.status,
        ...(showItems ? { items } : {}),
        ...(!hideMembers ? { assigneeIds: draft.assigneeIds ?? [] } : {}),
      });
      setDraftEdits(null);
    } catch {
      // Keep draft available for retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="group"
      aria-label="Nghiệm thu"
      className={cn(
        "grid items-start gap-4 rounded-xl border border-gray-200 bg-white p-4",
        compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
      )}
    >
      <label className="order-1 min-w-0 text-xs font-semibold text-gray-500">
        Trạng thái nghiệm thu
        <select
          value={draft.status}
          disabled={disabled || saving}
          onChange={(event) => updateDraft({ status: event.target.value as AcceptanceRow["status"] })}
          className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
        >
          <option value="pending">Chưa hoàn thành</option>
          <option value="testing">Đang test</option>
          <option value="tested">Đã test</option>
          <option value="acceptance">Nghiệm thu</option>
          <option value="rework">Làm lại</option>
          <option value="cancelled">Hủy bỏ</option>
          <option value="accepted">Hoàn thành</option>
        </select>
      </label>

      <label className="order-2 min-w-0 text-xs font-semibold text-gray-500">
        Ghi chú nghiệm thu
        <textarea
          value={draft.note}
          disabled={disabled || saving}
          maxLength={5000}
          rows={2}
          placeholder="Nhập ghi chú hoặc kết quả nghiệm thu..."
          onChange={(event) => updateDraft({ note: event.target.value })}
          className="mt-1.5 field-sizing-content max-h-48 min-h-10 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal leading-5 text-gray-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
        />
      </label>

      {showItems && (
        <div className="order-2 col-span-full min-w-0 border-t border-gray-100 pt-3.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500">Hạng mục nghiệm thu</p>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => updateDraft({ items: [...items, { id: crypto.randomUUID(), name: "", note: "" }] })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm dòng
            </button>
          </div>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
              Chưa có dòng con. Bấm “Thêm dòng” để thêm hạng mục.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="w-14 px-3 py-2 text-center">STT</th>
                    <th className="px-3 py-2">Tên công việc</th>
                    <th className="px-3 py-2">Ghi chú</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={item.name}
                          disabled={disabled || saving}
                          maxLength={500}
                          placeholder="Tên công việc..."
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <textarea
                          value={item.note}
                          disabled={disabled || saving}
                          maxLength={2000}
                          rows={1}
                          placeholder="Ghi chú..."
                          onChange={(event) => updateItem(item.id, { note: event.target.value })}
                          className="field-sizing-content max-h-40 min-h-9 w-full resize-y rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm leading-5 text-gray-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={disabled || saving}
                          onClick={() => updateDraft({ items: items.filter((entry) => entry.id !== item.id) })}
                          title="Xóa dòng"
                          aria-label={`Xóa dòng ${index + 1}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="order-3 col-span-full min-w-0 border-t border-gray-100 pt-3.5">
        <p className="mb-2 text-xs font-semibold text-gray-500">Ảnh nghiệm thu / Minh chứng</p>
        <AcceptanceImageInput imageUrl={row.imageUrl} disabled={disabled || saving} uploading={uploading} onUpload={onUpload} />
      </div>

      {!hideMembers && (
        <fieldset disabled={disabled || saving} className="order-4 col-span-full min-w-0 border-t border-gray-100 pt-3.5">
          <legend className="mb-2 text-xs font-semibold text-gray-500">Nhân sự tham gia nghiệm thu</legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
            {members.map((member) => (
              <label
                key={member.id}
                className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs text-gray-700 shadow-xs border border-gray-200/80 hover:bg-violet-50 hover:border-violet-200 has-[:disabled]:cursor-default transition"
              >
                <input
                  type="checkbox"
                  checked={draft.assigneeIds?.includes(member.id) ?? false}
                  onChange={(event) =>
                    updateDraft({
                      assigneeIds: event.target.checked
                        ? [...(draft.assigneeIds ?? []), member.id]
                        : (draft.assigneeIds ?? []).filter((id) => id !== member.id),
                    })
                  }
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-violet-600"
                />
                {member.name}
              </label>
            ))}
            {members.length === 0 && <p className="text-xs text-gray-400">Task chưa có người phụ trách.</p>}
          </div>
        </fieldset>
      )}

      {!onDraftChange && (
        <div className="order-5 col-span-full flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3.5">
          <div>
            {dirty && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Có thay đổi chưa lưu
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={disabled || saving || uploading || !dirty}
            onClick={() => void saveDraft()}
            className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-xs"
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi nghiệm thu"}
          </Button>
        </div>
      )}
    </div>
  );
}
