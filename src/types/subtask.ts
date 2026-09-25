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

/** Một lần bổ sung mô tả và đính kèm của Task, từ lần 2 trở đi. */
export interface SubtaskUpdateEntry {
  id: string;
  description?: string;
  images: string[];
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  createdAt: string;
}

/** Một yêu cầu dùng để ghép nội dung với URL ảnh thành Prompt có thể sao chép. */
export interface SubtaskPromptItem {
  id: string;
  content: string;
  /** Các link Cloudinary của ảnh tham chiếu (mỗi ảnh một URL). */
  imageUrls: string[];
  status: "unprocessed" | "processed" | "completed";
}

/** Một dòng vấn đề và giải pháp của Task. */
export interface SubtaskIssueEntry {
  id: string;
  problem: string;
  solution: string;
}

export interface SubtaskHandover {
  text: string;
  imageUrl: string;
}

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
  /** Người đã tạo Task; có thể trống với dữ liệu cũ chưa xác định được người tạo. */
  creator?: ProjectMember;
  /** UUID tài khoản được giao kiểm thử Task. */
  testerId?: string;
  tester?: ProjectMember;
  /** Ghi chú của lần test fail gần nhất. */
  testNote?: string;
  /** UUID tài khoản của những người đã xác nhận nhận Task. */
  acceptedAssigneeIds: string[];
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
  /** Các lần bổ sung mô tả và đính kèm sau lần đầu tiên. */
  updates: SubtaskUpdateEntry[];
  /** Các dòng yêu cầu và ảnh dùng trong khu vực tạo Prompt. */
  promptItems: SubtaskPromptItem[];
  /** Các dòng vấn đề và giải pháp. */
  issues: SubtaskIssueEntry[];
  /** Nội dung bàn giao và link ảnh. */
  handover?: SubtaskHandover;
}

export interface SubtaskInput {
  title: string;
  description?: string;
  workTaskId: string;
  /** Danh sách người phụ trách; phần tử đầu tiên là người phụ trách chính. */
  assigneeIds: string[];
  /** Mã nhân viên hoặc UUID tài khoản được giao kiểm thử. */
  testerId?: string;
  /** Chỉ quản trị viên được phép gửi trạng thái khi chỉnh sửa Task. */
  status?: TaskStatus;
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
  /** Các lần bổ sung mô tả và đính kèm sau lần đầu tiên. */
  updates: SubtaskUpdateEntry[];
  /** Các dòng vấn đề và giải pháp. */
  issues: SubtaskIssueEntry[];
}

export interface SubtaskReport extends ProgressReport {
  subtaskId: string;
}

export interface SubtaskTestResult {
  passed: boolean;
  note?: string;
}

/** Một lần Tester ghi kết quả Pass/Fail cho Task. */
export interface SubtaskTestHistoryEntry {
  id: string;
  subtaskId: string;
  tester?: ProjectMember;
  result: "passed" | "failed";
  note?: string;
  createdAt: string;
}

export function isSubtaskOverdue(subtask: Subtask, referenceDate: Date = new Date()): boolean {
  if (subtask.status === "done") return false;
  const dueDate = subtask.dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < getAppDateKey(referenceDate);
}
