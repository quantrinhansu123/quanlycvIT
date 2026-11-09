import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteAttendance } from "@/lib/supabase/attendance";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiException("Mã chấm công không hợp lệ.", 400);
    }
    // Bảng chấm công chưa cấp quyền DELETE cho authenticated; dùng service role
    // sau khi đã xác thực quản lý/quản trị ở trên.
    await deleteAttendance(createAdminSupabaseClient(), id);
    return apiSuccess(true, 200, "Đã xóa chấm công.");
  } catch (error) {
    return handleApiError(error);
  }
}
