import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { acceptSubtaskAssignment } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    if (access.role !== "member") {
      throw new ApiException("Chỉ nhân viên được giao Task mới cần xác nhận.", 403);
    }
    await assertSubtaskReadable(supabase, access, id);
    const subtask = await acceptSubtaskAssignment(supabase, id, access.id);
    return apiSuccess(subtask, 200, "Xác nhận nhận Task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
