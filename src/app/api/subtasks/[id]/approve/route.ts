import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { approveSubtask, assertAdminAccount } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    await assertAdminAccount(supabase);
    const subtask = await approveSubtask(supabase, id);
    if (!subtask) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(subtask, 200, "Đã duyệt task.");
  } catch (error) {
    return handleApiError(error);
  }
}
