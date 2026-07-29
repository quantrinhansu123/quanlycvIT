import type { TaskStatus } from "@/types/task";

interface KanbanStatusMeta {
  label: string;
  /** Chấm tròn cạnh tiêu đề cột. */
  dot: string;
  /** Thanh màu trên thẻ và thanh tiến độ. */
  bar: string;
  /** Nền pastel giúp phân biệt toàn bộ cột. */
  column: string;
  /** Nền vùng chứa thẻ. */
  body: string;
  /** Nền cột khi đang kéo thẻ vào. */
  drop: string;
  /** Đường phân cách theo màu trạng thái. */
  border: string;
}

export const KANBAN_STATUS_META: Record<TaskStatus, KanbanStatusMeta> = {
  todo: {
    label: "Cần làm",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    column: "bg-slate-50/70",
    body: "bg-slate-50/90",
    drop: "bg-slate-100",
    border: "border-slate-200",
  },
  inProgress: {
    label: "Đang làm",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    column: "bg-blue-50/60",
    body: "bg-blue-50/80",
    drop: "bg-blue-100/80",
    border: "border-blue-100",
  },
  review: {
    label: "Chờ đánh giá",
    dot: "bg-amber-400",
    bar: "bg-amber-400",
    column: "bg-amber-50/60",
    body: "bg-amber-50/80",
    drop: "bg-amber-100/80",
    border: "border-amber-100",
  },
  done: {
    label: "Hoàn thành",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    column: "bg-emerald-50/60",
    body: "bg-emerald-50/80",
    drop: "bg-emerald-100/80",
    border: "border-emerald-100",
  },
};

export const KANBAN_COLUMNS: TaskStatus[] = [
  "todo",
  "inProgress",
  "review",
  "done",
];
