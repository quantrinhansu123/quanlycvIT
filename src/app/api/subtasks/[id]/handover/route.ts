import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskHandover } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { updateSubtaskHandover } from "@/lib/supabase/data";

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
        throw new ApiException("Chỉ người được giao Task mới được cập nhật nội dung bàn giao.", 403);
      }
    }

    const handover = parseSubtaskHandover(await readJsonObject(request));
    const updated = await updateSubtaskHandover(supabase, id, handover);
    if (!updated) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(updated, 200, "Đã lưu nội dung bàn giao.");
  } catch (error) {
    return handleApiError(error);
  }
}
