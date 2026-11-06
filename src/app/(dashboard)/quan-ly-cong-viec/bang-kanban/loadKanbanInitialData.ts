import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listAcceptanceKanbanItems } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

/** Tải toàn bộ công việc hiển thị trên bảng Kanban (không phân trang thực tế). */
export async function loadKanbanInitialData(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess
) {
  return { initialItems: await listAcceptanceKanbanItems(supabase, access.role === "member" ? access.id : undefined) };
}
