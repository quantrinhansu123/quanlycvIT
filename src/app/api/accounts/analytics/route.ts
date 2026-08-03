import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { listAccountAnalytics } from "@/lib/supabase/accounts";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    return apiSuccess(await listAccountAnalytics(supabase));
  } catch (error) {
    return handleApiError(error);
  }
}
