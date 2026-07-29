import type { ProjectMember } from "@/types/project";
import { getAppDateKey } from "@/lib/utils";

export type TaskStatus = "todo" | "inProgress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Cần làm" },
  { value: "inProgress", label: "Đang làm" },
  { value: "review", label: "Chờ đánh giá" },
  { value: "done", label: "Hoàn thành" },
];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo: { label: "Cần làm", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  inProgress: { label: "Đang làm", badge: "bg-sky-100 text-sky-600", dot: "bg-sky-500" },
  review: { label: "Chờ đánh giá", badge: "bg-amber-100 text-amber-600", dot: "bg-amber-500" },
  done: { label: "Hoàn thành", badge: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
};

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
  { value: "urgent", label: "Khẩn cấp" },
];

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; badge: string }> = {
  low: { label: "Thấp", badge: "bg-gray-100 text-gray-500" },
  medium: { label: "Trung bình", badge: "bg-sky-100 text-sky-600" },
  high: { label: "Cao", badge: "bg-amber-100 text-amber-700" },
  urgent: { label: "Khẩn cấp", badge: "bg-rose-100 text-rose-600" },
};

export interface WorkTask {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  projectId: string;
  /** Người phụ trách chính; giữ lại cho bộ lọc và dữ liệu cũ. */
  assigneeId: string;
  /** Toàn bộ người phụ trách, phần tử đầu tiên là người chính. */
  assignees: ProjectMember[];
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  progress: number;
  tags: string[];
  dependsOnTaskId?: string;
}

export interface WorkTaskInput {
  title: string;
  description?: string;
  projectId: string;
  /** Danh sách người phụ trách; phần tử đầu tiên là người phụ trách chính. */
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  progress: number;
  tags: string[];
  dependsOnTaskId?: string;
}

export type TaskReportAttachmentKind = "image" | "file";

export interface TaskReportAttachment {
  id: string;
  kind: TaskReportAttachmentKind;
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export interface TaskReportLink {
  id: string;
  label?: string;
  url: string;
}

export interface ProgressReport {
  id: string;
  authorId: string;
  authorName?: string;
  authorColor?: string;
  content: string;
  progress: number;
  attachments: TaskReportAttachment[];
  links: TaskReportLink[];
  createdAt: string;
}

export interface TaskReport extends ProgressReport {
  taskId: string;
}

export interface ProgressReportSubmission {
  authorId?: string;
  content: string;
  progress: number;
  images: File[];
  files: File[];
  links: Omit<TaskReportLink, "id">[];
}

/** Tối đa 10MB cho mỗi ảnh tiến độ hoặc file đính kèm. */
export const TASK_REPORT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const TASK_REPORT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export function isTaskOverdue(task: WorkTask, referenceDate: Date = new Date()): boolean {
  if (task.status === "done") return false;
  const dueDate = task.dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < getAppDateKey(referenceDate);
}
