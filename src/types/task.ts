import type { ProjectMember } from "@/types/project";
import { getAppDateKey } from "@/lib/utils";

export type TaskStatus = "todo" | "inProgress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Cần làm" },
  { value: "inProgress", label: "Đang làm" },
  { value: "review", label: "Chờ duyệt" },
  { value: "done", label: "Đã hoàn thành" },
];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo: { label: "Cần làm", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  inProgress: { label: "Đang làm", badge: "bg-sky-100 text-sky-600", dot: "bg-sky-500" },
  review: { label: "Chờ duyệt", badge: "bg-amber-100 text-amber-600", dot: "bg-amber-500" },
  done: { label: "Đã hoàn thành", badge: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
};

/**
 * Trạng thái Công việc được suy ra hoàn toàn từ các Task con:
 * - Chưa có Task hoặc tất cả Task chưa bắt đầu: Cần làm.
 * - Có ít nhất một Task đã bắt đầu/chờ duyệt/hoàn thành: Đang làm.
 * - Chỉ hoàn thành khi có Task và tất cả Task đều đã được duyệt hoàn thành.
 */
export function deriveWorkTaskStatus(
  subtasks: ReadonlyArray<{ status: TaskStatus; progress: number }>
): TaskStatus {
  if (subtasks.length === 0) return "todo";
  if (subtasks.every((subtask) => subtask.status === "done")) return "done";
  if (
    subtasks.some(
      (subtask) => subtask.progress > 0 || subtask.status !== "todo"
    )
  ) {
    return "inProgress";
  }
  return "todo";
}

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

/** Tệp đính kèm đã tải lên Google Drive. */
export interface TaskFileAttachment {
  name: string;
  url: string;
}

/** Liên kết ngoài đính kèm. */
export interface TaskLinkAttachment {
  label?: string;
  url: string;
  description?: string;
}

/** Bản rút gọn cho dropdown “công việc tiền đề”: không hydrate người phụ trách/task con. */
export interface WorkTaskOption {
  id: string;
  title: string;
}

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
  /** Tệp đính kèm, đã tải lên Google Drive. */
  files: TaskFileAttachment[];
  /** Liên kết ngoài đính kèm. */
  links: TaskLinkAttachment[];
  /** Danh sách URL ảnh minh họa của công việc. */
  images: string[];
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
  /** Tối đa 10 tệp, mỗi tệp là link Google Drive. */
  files: TaskFileAttachment[];
  /** Tối đa 10 liên kết ngoài. */
  links: TaskLinkAttachment[];
  /** Tối đa 10 URL ảnh đã tải lên Cloudinary. */
  images: string[];
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
