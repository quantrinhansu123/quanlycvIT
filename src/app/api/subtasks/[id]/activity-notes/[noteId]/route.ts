import { ApiException, apiSuccess, handleApiError, readJsonObject, throwDatabaseError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { updateSubtaskActivityNote, deleteSubtaskActivityNote } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string; noteId: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAssigneeExists(supabase: ApiSupabaseClient, assigneeId: string | null) {
  if (!assigneeId) return;
  const { data, error } = await supabase.from("tai_khoan").select("id").eq("id", assigneeId).maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Người phụ trách không tồn tại.", 400);
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
    const rawAssignee = typeof body.assigneeId === "string" ? body.assigneeId.trim() : "";
    if (!result || result.length > 160) {
      throw new ApiException("Kết quả là bắt buộc và tối đa 160 ký tự.", 400);
    }
    if (!content || content.length > 3000) {
      throw new ApiException("Nội dung là bắt buộc và tối đa 3.000 ký tự.", 400);
    }
    if (rawAssignee && !UUID_RE.test(rawAssignee)) {
      throw new ApiException("Người phụ trách không hợp lệ.", 400);
    }
    const assigneeId = rawAssignee || null;
    await assertAssigneeExists(supabase, assigneeId);
    const note = await updateSubtaskActivityNote(supabase, id, noteId, result, content, assigneeId);
    if (!note) throw new ApiException("Không tìm thấy ghi chú hoạt động.", 404);
    return apiSuccess(note, 200, "Đã cập nhật ghi chú hoạt động.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id, noteId } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const deleted = await deleteSubtaskActivityNote(supabase, id, noteId);
    if (!deleted) throw new ApiException("Không tìm thấy ghi chú hoạt động.", 404);
    return apiSuccess(true, 200, "Đã xóa ghi chú hoạt động.");
  } catch (error) {
    return handleApiError(error);
  }
}
