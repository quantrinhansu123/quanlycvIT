import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDutyRecurringRuleInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createDutyRecurringRule, listDutyRecurringRules } from "@/lib/supabase/data";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    await requireRequestAccount(supabase);
    const rules = await listDutyRecurringRules(supabase);
    return apiSuccess(rules);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const input = parseDutyRecurringRuleInput(await readJsonObject(request));
    const rule = await createDutyRecurringRule(supabase, input, access);
    return apiSuccess(rule, 201, "Tạo quy tắc lịch trực thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
