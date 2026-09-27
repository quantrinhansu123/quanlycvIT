import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listSubtasksPage } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 30;

export async function loadSubtaskListInitialData(supabase: ApiSupabaseClient, access: RequestAccountAccess) {
  const isMember = access.role === "member";
  const initialSubtasks = await listSubtasksPage(supabase, {
    assigneeIds: isMember ? [access.id] : undefined,
    page: INITIAL_PAGE,
    pageSize: INITIAL_PAGE_SIZE,
  });

  // Dữ liệu dropdown được tải nền ở client; không chặn lần hiển thị danh sách đầu tiên.
  return { initialSubtasks };
}
