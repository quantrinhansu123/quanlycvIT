import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { throwDatabaseError } from "@/lib/api/response";
import type { AppNotification } from "@/types/notification";

interface NotificationRow {
  id: string;
  loai: "task_assigned" | "task_needs_testing" | "task_test_failed";
  tieu_de: string;
  noi_dung: string;
  task_id: string | null;
  da_doc: boolean;
  created_at: string;
}

function hydrateNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type:
      row.loai === "task_needs_testing"
        ? "taskNeedsTesting"
        : row.loai === "task_test_failed"
          ? "taskTestFailed"
          : "taskAssigned",
    title: row.tieu_de,
    content: row.noi_dung,
    taskId: row.task_id ?? undefined,
    read: row.da_doc,
    createdAt: row.created_at,
  };
}

export async function listNotifications(
  supabase: ApiSupabaseClient,
  accountId: string,
  limit = 30
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("thong_bao")
    .select("id,loai,tieu_de,noi_dung,task_id,da_doc,created_at")
    .eq("tai_khoan_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwDatabaseError(error);
  return ((data ?? []) as NotificationRow[]).map(hydrateNotification);
}

export async function markNotificationRead(
  supabase: ApiSupabaseClient,
  notificationId: string,
  accountId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("thong_bao")
    .update({ da_doc: true })
    .eq("id", notificationId)
    .eq("tai_khoan_id", accountId)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}
