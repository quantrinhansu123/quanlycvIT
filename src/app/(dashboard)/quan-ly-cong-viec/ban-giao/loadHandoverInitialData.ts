import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listSubtasksPage } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const HANDOVER_PAGE = 1;
const HANDOVER_PAGE_SIZE = 200;

/** Tải danh sách Task để lập văn bản bàn giao (không phân trang thực tế). */
export async function loadHandoverInitialData(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess
) {
  const isMember = access.role === "member";

  const initialSubtasks = await listSubtasksPage(supabase, {
    assigneeIds: isMember ? [access.id] : undefined,
    page: HANDOVER_PAGE,
    pageSize: HANDOVER_PAGE_SIZE,
  });

  return { initialSubtasks };
}
