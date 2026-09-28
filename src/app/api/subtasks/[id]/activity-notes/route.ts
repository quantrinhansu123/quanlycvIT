import { ApiException, apiSuccess, handleApiError, readJsonObject, throwDatabaseError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { createSubtaskActivityNote } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseNote(body: Record<string, unknown>) {
  const result = typeof body.result === "string" ? body.result.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId.trim() : "";
  if (!result || result.length > 160) {
    throw new ApiException("Kết quả là bắt buộc và tối đa 160 ký tự.", 400);
  }
  if (!content || content.length > 3000) {
    throw new ApiException("Nội dung là bắt buộc và tối đa 3.000 ký tự.", 400);
  }
  if (assigneeId && !UUID_RE.test(assigneeId)) {
    throw new ApiException("Người phụ trách không hợp lệ.", 400);
  }
  return { result, content, assigneeId: assigneeId || null };
}

async function assertAssigneeExists(supabase: ApiSupabaseClient, assigneeId: string | null) {
  if (!assigneeId) return;
  const { data, error } = await supabase.from("tai_khoan").select("id").eq("id", assigneeId).maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Người phụ trách không tồn tại.", 400);
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const values = parseNote(await readJsonObject(request));
    await assertAssigneeExists(supabase, values.assigneeId);
    const note = await createSubtaskActivityNote(supabase, id, values.result, values.content, values.assigneeId);
    return apiSuccess(note, 201, "Đã thêm ghi chú hoạt động.");
  } catch (error) {
    return handleApiError(error);
  }
}
