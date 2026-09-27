import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { updateSubtaskActivityNote } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string; noteId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id, noteId } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const body = await readJsonObject(request);
    const result = typeof body.result === "string" ? body.result.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!result || result.length > 160) {
      throw new ApiException("Kết quả là bắt buộc và tối đa 160 ký tự.", 400);
    }
    if (!content || content.length > 3000) {
      throw new ApiException("Nội dung là bắt buộc và tối đa 3.000 ký tự.", 400);
    }
    const note = await updateSubtaskActivityNote(supabase, id, noteId, result, content);
    if (!note) throw new ApiException("Không tìm thấy ghi chú hoạt động.", 404);
    return apiSuccess(note, 200, "Đã cập nhật ghi chú hoạt động.");
  } catch (error) {
    return handleApiError(error);
  }
}
