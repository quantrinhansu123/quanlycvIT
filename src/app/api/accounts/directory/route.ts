import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { listAccountDepartments } from "@/lib/supabase/accounts";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    return apiSuccess(await listAccountDepartments(supabase));
  } catch (error) {
    return handleApiError(error);
  }
}
