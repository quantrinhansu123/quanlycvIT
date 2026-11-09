import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceCategoryInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { createFinanceCategory, listFinanceCategories } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    return apiSuccess(await withFinanceClient(main, (client) => listFinanceCategories(client)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const input = parseFinanceCategoryInput(await readJsonObject(request));
    return apiSuccess(await withFinanceClient(main, (client) => createFinanceCategory(client, input)), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
