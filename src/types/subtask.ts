import type { ProjectMember } from "@/types/project";
import type { ProgressReport, TaskPriority, TaskStatus } from "@/types/task";

export interface Subtask {
  id: string;
  title: string;
  description?: string;
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
}

export interface SubtaskInput {
  title: string;
  description?: string;
  workTaskId: string;
  /** Danh sách người phụ trách; phần tử đầu tiên là người phụ trách chính. */
  assigneeIds: string[];
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  progress: number;
  tags: string[];
}

export interface SubtaskReport extends ProgressReport {
  subtaskId: string;
}

export function isSubtaskOverdue(subtask: Subtask, referenceDate: Date = new Date()): boolean {
  if (subtask.status === "done") return false;
  const due = new Date(subtask.dueDate);
  return due.getTime() < referenceDate.setHours(0, 0, 0, 0);
}
