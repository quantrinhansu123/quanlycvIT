import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDutyRecurringRuleInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteDutyRecurringRule, updateDutyRecurringRule } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseDutyRecurringRuleInput(await readJsonObject(request));
    const rule = await updateDutyRecurringRule(supabase, id, input);
    if (!rule) throw new ApiException("Không tìm thấy quy tắc lịch trực.", 404);
    return apiSuccess(rule, 200, "Cập nhật quy tắc lịch trực thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const deleted = await deleteDutyRecurringRule(supabase, id);
    if (!deleted) throw new ApiException("Không tìm thấy quy tắc lịch trực.", 404);
    return apiSuccess(true, 200, "Xóa quy tắc lịch trực thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
