export type AppNotificationType = "taskAssigned" | "taskNeedsTesting" | "taskTestFailed";

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  content: string;
  taskId?: string;
  read: boolean;
  createdAt: string;
}
