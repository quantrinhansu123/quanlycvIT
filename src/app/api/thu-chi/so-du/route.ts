import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { financeCurrentBalance } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    return apiSuccess(await financeCurrentBalance(createApiSupabaseClient(request)));
  } catch (error) {
    return handleApiError(error);
  }
}
