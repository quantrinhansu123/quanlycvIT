import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskUpdates } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { updateSubtaskUpdates } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);

    if (access.role === "member") {
      const { data: assignment, error } = await supabase
        .from("task_phu_trach")
        .select("task_id")
        .eq("task_id", id)
        .eq("tai_khoan_id", access.id)
        .maybeSingle();
      if (error) throw error;
      if (!assignment) {
        throw new ApiException("Chỉ người được giao Task mới được thêm lần bổ sung.", 403);
      }
    }

    const updates = parseSubtaskUpdates(await readJsonObject(request));
    const subtask = await updateSubtaskUpdates(supabase, id, updates);
    if (!subtask) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(subtask, 200, "Đã lưu lần bổ sung.");
  } catch (error) {
    return handleApiError(error);
  }
}
