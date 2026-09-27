"use client";

import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  CircleCheck,
  Clock3,
  FileClock,
  ListChecks,
  MessageSquareText,
  Pencil,
  PlayCircle,
  Plus,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/components/timeline/ActivityTimeline";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { subtaskService } from "@/services/subtask-service";
import {
  TASK_ACTIVITY_META,
  type TaskActivityEvent,
  type TaskActivityType,
} from "@/types/activity";

const ACTIVITY_ICONS: Record<TaskActivityType, LucideIcon> = {
  created: FileClock,
  accepted: UserCheck,
  status_changed: PlayCircle,
  progress_reported: ListChecks,
  approved: CircleCheck,
  edited: Pencil,
  note: MessageSquareText,
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  inProgress: "Đang làm",
  testing: "Đang kiểm thử",
  review: "Chờ duyệt",
  done: "Hoàn thành",
};

function formatActivityContent(detail?: Record<string, unknown>): string {
  if (!detail || Object.keys(detail).length === 0) return "Không có nội dung chi tiết";
  if (typeof detail.noi_dung === "string") return detail.noi_dung;

  if (typeof detail.tien_do === "number") {
    return `Tiến độ báo cáo: ${detail.tien_do}%`;
  }

  if (typeof detail.tu === "string" && typeof detail.den === "string") {
    return `Trạng thái: ${TASK_STATUS_LABELS[detail.tu] ?? detail.tu} → ${TASK_STATUS_LABELS[detail.den] ?? detail.den}`;
  }

  const entries = Object.entries(detail).map(([key, value]) => {
    const label = key === "trang_thai" ? "Trạng thái" : key;
    const text = typeof value === "string" && key === "trang_thai"
      ? TASK_STATUS_LABELS[value] ?? value
      : String(value);
    return `${label}: ${text}`;
  });
  return entries.join(" · ");
}

function formatActivityTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface TaskActivityTimelineProps {
  taskId: string;
  currentAccountId?: string;
  canEditAnyNote?: boolean;
  events: TaskActivityEvent[];
  /** Còn sự kiện cũ hơn chưa tải (phân trang) — hiển thị nút "Xem thêm". */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onActivityChanged?: () => Promise<void>;
}

/** Nhật ký hoạt động Task: tạo, xác nhận, đổi trạng thái, báo cáo, duyệt, sửa. */
export function TaskActivityTimeline({
  taskId,
  currentAccountId,
  canEditAnyNote = false,
  events,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onActivityChanged,
}: TaskActivityTimelineProps) {
  const { notify } = useFeedback();
  const [editor, setEditor] = useState<{ id?: string; result: string; content: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  function openNewNote() {
    setNoteError("");
    setEditor({ result: "", content: "" });
  }

  function openEditNote(event: TaskActivityEvent) {
    setNoteError("");
    setEditor({
      id: event.id,
      result: event.title,
      content: typeof event.detail?.noi_dung === "string" ? event.detail.noi_dung : "",
    });
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || savingNote) return;
    setSavingNote(true);
    setNoteError("");
    try {
      const values = { result: editor.result.trim(), content: editor.content.trim() };
      if (editor.id) await subtaskService.updateSubtaskActivityNote(taskId, editor.id, values);
      else await subtaskService.addSubtaskActivityNote(taskId, values);
      setEditor(null);
      notify({ type: "success", title: editor.id ? "Đã cập nhật ghi chú" : "Đã thêm ghi chú hoạt động" });
      await onActivityChanged?.();
    } catch (error) {
      setNoteError(getErrorMessage(error, "Không thể lưu ghi chú. Vui lòng thử lại."));
    } finally {
      setSavingNote(false);
    }
  }

  const addNoteButton = (
    <Button type="button" variant="secondary" size="sm" onClick={openNewNote}>
      <Plus className="h-4 w-4" />
      Thêm ghi chú
    </Button>
  );

  const noteForm = editor && (
    <form onSubmit={(event) => void saveNote(event)} className="mb-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-600">
          Kết quả
          <input
            autoFocus
            maxLength={160}
            required
            value={editor.result}
            onChange={(event) => setEditor((current) => current ? { ...current, result: event.target.value } : current)}
            placeholder="VD: Đã hoàn thành kiểm tra"
            className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-600 sm:col-span-2">
          Nội dung
          <textarea
            required
            maxLength={3000}
            rows={3}
            value={editor.content}
            onChange={(event) => setEditor((current) => current ? { ...current, content: event.target.value } : current)}
            placeholder="Nhập nội dung ghi chú..."
            className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Người thực hiện và thời gian được ghi tự động khi lưu.</p>
      {noteError && <p role="alert" className="mt-2 text-xs text-rose-600">{noteError}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditor(null)} disabled={savingNote}>Hủy</Button>
        <Button type="submit" size="sm" disabled={savingNote}>
          {savingNote ? "Đang lưu..." : editor.id ? "Lưu chỉnh sửa" : "Thêm ghi chú"}
        </Button>
      </div>
    </form>
  );

  if (events.length === 0) {
    return (
      <div>
        <div className="mb-3 flex justify-end">{addNoteButton}</div>
        {noteForm}
        <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 text-center">
          <CalendarDays className="h-9 w-9 text-gray-300" />
          <p className="mt-3 text-sm font-bold text-gray-800">Chưa có lịch sử hoạt động</p>
          <p className="mt-1 text-xs text-gray-400">Các cập nhật trạng thái, phân công và báo cáo</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">{addNoteButton}</div>
      {noteForm}
      <div className="max-h-[460px] overflow-y-auto pr-1">
      <div className="relative space-y-3 py-1 pl-11 sm:pl-12">
        <div
          aria-hidden="true"
          className="absolute bottom-3 left-[15px] top-3 w-px bg-gradient-to-b from-violet-300 via-brand-200 to-emerald-200 sm:left-[19px]"
        />

        {events.map((event) => {
          const meta = TASK_ACTIVITY_META[event.type];
          const Icon = ACTIVITY_ICONS[event.type];

          return (
            <article key={event.id} className="relative">
              <span className="absolute -left-11 top-1 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 shadow-sm sm:-left-12 sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" />
              </span>

              <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      meta.badge
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                  {event.editable && (canEditAnyNote || event.actorId === currentAccountId) && (
                    <button
                      type="button"
                      onClick={() => openEditNote(event)}
                      className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                      aria-label={`Chỉnh sửa ghi chú ${event.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Chỉnh sửa
                    </button>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Kết quả</dt>
                    <dd className="mt-0.5 break-words text-xs font-medium text-gray-800">{event.title}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Nội dung</dt>
                    <dd className="mt-0.5 break-words text-xs text-gray-600">{formatActivityContent(event.detail)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Người thực hiện</dt>
                    <dd className="mt-0.5 truncate text-xs font-medium text-gray-700">{event.actorName ?? "Không xác định"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Thời gian</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600" title={formatActivityTimestamp(event.createdAt)}>
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <time dateTime={event.createdAt}>{formatRelativeTime(event.createdAt) || formatActivityTimestamp(event.createdAt)}</time>
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}

        {hasMore && (
          <div className="pt-1 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Đang tải..." : "Xem thêm hoạt động"}
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
