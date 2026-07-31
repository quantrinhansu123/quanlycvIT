export interface AppNotification {
  id: string;
  type: "taskAssigned";
  title: string;
  content: string;
  taskId?: string;
  read: boolean;
  createdAt: string;
}
