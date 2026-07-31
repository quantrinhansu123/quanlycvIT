import type { ProjectMember } from "@/types/project";
import type {
  ProgressReport,
  TaskFileAttachment,
  TaskLinkAttachment,
  TaskPriority,
  TaskStatus,
} from "@/types/task";
import { getAppDateKey } from "@/lib/utils";

/** Định nghĩa thật ở task.ts, dùng chung cho công việc, dự án và task. */
export type { TaskFileAttachment, TaskLinkAttachment };

export interface Subtask {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  workTaskId: string;
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
  /** Tệp đính kèm, đã tải lên Google Drive. */
  files: TaskFileAttachment[];
  /** Liên kết ngoài đính kèm. */
  links: TaskLinkAttachment[];
  /** Danh sách URL ảnh minh họa của Task. */
  images: string[];
}

export interface SubtaskInput {
  title: string;
  description?: string;
  workTaskId: string;
  /** Danh sách người phụ trách; phần tử đầu tiên là người phụ trách chính. */
  assigneeIds: string[];
  /** Trạng thái được server tự tính từ tiến độ, không nhận từ form. */
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  progress: number;
  tags: string[];
  /** Tối đa 10 tệp, mỗi tệp là link Google Drive. */
  files: TaskFileAttachment[];
  /** Tối đa 10 liên kết ngoài. */
  links: TaskLinkAttachment[];
  /** Tối đa 10 URL ảnh đã tải lên Cloudinary. */
  images: string[];
}

export interface SubtaskReport extends ProgressReport {
  subtaskId: string;
}

export function isSubtaskOverdue(subtask: Subtask, referenceDate: Date = new Date()): boolean {
  if (subtask.status === "done") return false;
  const dueDate = subtask.dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < getAppDateKey(referenceDate);
}
