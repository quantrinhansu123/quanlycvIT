import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { createFinanceTransaction, listFinanceTransactions } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const params = new URL(request.url).searchParams;
    const result = await withFinanceClient(main, (client) =>
      listFinanceTransactions(
        client,
        Number(params.get("page")) || 1,
        Math.min(Number(params.get("pageSize")) || 50, 5000),
        params.get("type") ?? undefined,
        params.getAll("categoryId").filter(Boolean),
        params.get("start") ?? undefined,
        params.get("end") ?? undefined,
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

export async function POST(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const input = parseFinanceInput(await readJsonObject(request));
    return apiSuccess(await withFinanceClient(main, (client) => createFinanceTransaction(client, input)), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
