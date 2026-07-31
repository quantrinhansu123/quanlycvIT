import { apiClient } from "@/services/api-client";
import type { AppNotification } from "@/types/notification";

export const notificationService = {
  getNotifications(): Promise<AppNotification[]> {
    return apiClient.get<AppNotification[]>("/notifications");
  },

  markRead(id: string): Promise<boolean> {
    return apiClient.patch<boolean>(`/notifications/${id}`);
  },
};
