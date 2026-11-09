import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { financeSummary } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const params = new URL(request.url).searchParams;
    const end = params.get("end") ?? new Date().toISOString().slice(0, 10);
    const start = params.get("start") ?? `${end.slice(0, 7)}-01`;
    return apiSuccess(await withFinanceClient(main, (client) => financeSummary(client, start, end)));
  } catch (error) {
    return handleApiError(error);
  }
}
