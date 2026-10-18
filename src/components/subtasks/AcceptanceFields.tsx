"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ProjectMember } from "@/types/project";
import type { AcceptanceRow } from "@/types/subtask";
import { AcceptanceImageInput } from "@/components/subtasks/AcceptanceImageInput";

export function AcceptanceFields({
  compact = false,
  hideMembers = false,
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
  members: ProjectMember[];
  row: AcceptanceRow;
  disabled: boolean;
  uploading: boolean;
  onSave: (patch: Partial<AcceptanceRow>) => void | Promise<void>;
  onDraftChange?: (patch: Partial<AcceptanceRow>) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [localDraft, setDraft] = useState(row);
  const draft = onDraftChange ? row : localDraft;
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(row);
  }, [row, dirty]);

  function updateDraft(patch: Partial<AcceptanceRow>) {
    if (onDraftChange) {
      onDraftChange(patch);
      return;
    }
    setDirty(true);
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function saveDraft() {
    if (disabled || saving || !dirty) return;
    setSaving(true);
    try {
      await onSave({
        note: draft.note,
        status: draft.status,
        ...(!hideMembers ? { assigneeIds: draft.assigneeIds ?? [] } : {}),
      });
      setDirty(false);
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
        <input
          type="text"
          value={draft.note}
          disabled={disabled || saving}
          maxLength={5000}
          placeholder="Nhập ghi chú hoặc kết quả nghiệm thu..."
          onChange={(event) => updateDraft({ note: event.target.value })}
          className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal text-gray-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
        />
      </label>

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
