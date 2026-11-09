import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { financeDashboard } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const params = new URL(request.url).searchParams;
    const end = params.get("end") ?? new Date().toISOString().slice(0, 10);
    const start = params.get("start") ?? `${end.slice(0, 7)}-01`;
    const result = await withFinanceClient(main, (client) =>
      financeDashboard(
        client,
        Number(params.get("page")) || 1,
        Math.min(Number(params.get("pageSize")) || 20, 5000),
        params.get("type") ?? undefined,
        params.getAll("categoryId").filter(Boolean),
        start,
        end,
        params.get("search")?.trim() || undefined,
        params.get("sort") ?? undefined,
        params.get("direction") ?? undefined
      )
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
