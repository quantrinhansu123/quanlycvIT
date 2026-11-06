import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { moveAcceptanceKanbanItem } from "@/lib/supabase/data";
import type { AcceptanceStatus } from "@/types/subtask";

interface RouteParams { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id, itemId } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    if (access.role === "member") {
      const { data, error } = await supabase.from("task_phu_trach")
        .select("task_id").eq("task_id", id).eq("tai_khoan_id", access.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiException("Chỉ người được giao Task mới được chuyển hạng mục.", 403);
    }
    const body = await readJsonObject(request);
    const statuses: AcceptanceStatus[] = ["pending", "inProgress", "testing", "tested", "acceptance", "rework", "cancelled", "accepted"];
    if (typeof body.detailId !== "string" || !body.detailId || body.detailId.length > 80 ||
      !statuses.includes(body.status as AcceptanceStatus)) {
      throw new ApiException("Hạng mục hoặc trạng thái không hợp lệ.", 400);
    }
    const moved = await moveAcceptanceKanbanItem(supabase, id, body.detailId, itemId, body.status as AcceptanceStatus);
    if (!moved) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(true, 200, "Đã chuyển hạng mục.");
  } catch (error) {
    return handleApiError(error);
  }
}
