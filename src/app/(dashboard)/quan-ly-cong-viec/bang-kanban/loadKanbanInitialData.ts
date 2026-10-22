import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listWorkTasksPage } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const KANBAN_PAGE = 1;
const KANBAN_PAGE_SIZE = 200;

/** Tải toàn bộ công việc hiển thị trên bảng Kanban (không phân trang thực tế). */
export async function loadKanbanInitialData(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess
) {
  const isMember = access.role === "member";

  const { items: tasks } = await listWorkTasksPage(supabase, {
    assigneeIds: isMember ? [access.id] : undefined,
    page: KANBAN_PAGE,
    pageSize: KANBAN_PAGE_SIZE,
  });

  return { initialTasks: tasks };
}
