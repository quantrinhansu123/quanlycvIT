import type { AcceptanceStatus } from "@/types/subtask";
import type { TaskPriority } from "@/types/task";
import type { TaskStatus } from "@/types/task";

export interface KanbanDetailItem {
  id: string;
  taskId: string;
  detailId: string;
  itemId: string;
  title: string;
  taskTitle: string;
  taskStatus: TaskStatus;
  workTaskTitle: string;
  projectId: string;
  assigneeIds: string[];
  note: string;
  status: AcceptanceStatus;
  priority: TaskPriority;
  dueDate: string;
}
