import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertDutyShiftAssignee, requireRequestAccount } from "@/lib/supabase/authorization";
import { getDutyChecklistItemShiftId, toggleDutyChecklistItem } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);

    const body = await readJsonObject(request);
    if (typeof body.done !== "boolean") {
      throw new ApiException("Vui lòng truyền done dạng true/false.", 400);
    }

    const caId = await getDutyChecklistItemShiftId(supabase, id);
    if (!caId) throw new ApiException("Không tìm thấy đầu việc.", 404);
    await assertDutyShiftAssignee(supabase, access, caId);

    const item = await toggleDutyChecklistItem(supabase, id, body.done, access);
    return apiSuccess(item, 200, body.done ? "Đã đánh dấu hoàn thành." : "Đã bỏ đánh dấu hoàn thành.");
  } catch (error) {
    return handleApiError(error);
  }
}
