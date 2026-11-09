import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { financeCurrentBalance } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    return apiSuccess(await withFinanceClient(main, (client) => financeCurrentBalance(client)));
  } catch (error) {
    return handleApiError(error);
  }
}
