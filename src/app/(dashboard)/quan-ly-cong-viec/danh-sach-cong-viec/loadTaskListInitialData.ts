import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listWorkTasksPage } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export async function loadTaskListInitialData(supabase: ApiSupabaseClient, access: RequestAccountAccess) {
  const isMember = access.role === "member";

  // Bộ lọc dự án, nhân sự và công việc tiền đề tải nền ở client, không chặn bảng.
  const initialTasks = await listWorkTasksPage(supabase, {
    assigneeIds: isMember ? [access.id] : undefined,
    page: INITIAL_PAGE,
    pageSize: INITIAL_PAGE_SIZE,
  });

  return { initialTasks };
}
