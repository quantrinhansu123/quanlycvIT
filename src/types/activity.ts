export type TaskActivityType =
  | "created"
  | "accepted"
  | "status_changed"
  | "progress_reported"
  | "approved"
  | "edited"
  | "note";

export interface TaskActivityEvent {
  id: string;
  taskId: string;
  type: TaskActivityType;
  title: string;
  detail?: Record<string, unknown>;
  actorId?: string;
  actorName?: string;
  actorColor?: string;
  createdAt: string;
  editable?: boolean;
}

export interface TaskActivityNoteInput {
  result: string;
  content: string;
}

export const TASK_ACTIVITY_META: Record<
  TaskActivityType,
  { label: string; badge: string; dot: string }
> = {
  created: { label: "Tạo Task", badge: "bg-violet-100 text-violet-600", dot: "bg-violet-500" },
  accepted: { label: "Xác nhận nhận Task", badge: "bg-sky-100 text-sky-600", dot: "bg-sky-500" },
  status_changed: { label: "Đổi trạng thái", badge: "bg-amber-100 text-amber-600", dot: "bg-amber-500" },
  progress_reported: {
    label: "Báo cáo tiến độ",
    badge: "bg-orange-100 text-orange-600",
    dot: "bg-orange-500",
  },
  approved: { label: "Đã duyệt", badge: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
  edited: { label: "Chỉnh sửa", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  note: { label: "Ghi chú", badge: "bg-violet-100 text-violet-600", dot: "bg-violet-500" },
};
