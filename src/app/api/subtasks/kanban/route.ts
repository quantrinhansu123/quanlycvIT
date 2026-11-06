import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { listAcceptanceKanbanItems } from "@/lib/supabase/data";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    return apiSuccess(await listAcceptanceKanbanItems(supabase, access.role === "member" ? access.id : undefined));
  } catch (error) {
    return handleApiError(error);
  }
}
