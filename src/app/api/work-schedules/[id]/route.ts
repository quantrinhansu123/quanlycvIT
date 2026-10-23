import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteWorkSchedule } from "@/lib/supabase/work-schedules";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiException("Mã lịch làm việc không hợp lệ.", 400);
    }
    await deleteWorkSchedule(supabase, id);
    return apiSuccess(true, 200, "Đã xóa lịch làm việc.");
  } catch (error) {
    return handleApiError(error);
  }
}
