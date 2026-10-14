import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskHandover, parseSubtaskUpdates } from "@/lib/api/validation";
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

    const body = await readJsonObject(request);
    const updates = parseSubtaskUpdates(body);
    if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 5000)) {
      throw new ApiException("Mô tả chi tiết không hợp lệ (tối đa 5000 ký tự).", 400);
    }
    if (body.handover !== undefined && (!body.handover || typeof body.handover !== "object" || Array.isArray(body.handover))) {
      throw new ApiException("Trạng thái chi tiết không hợp lệ.", 400);
    }
    const subtask = await updateSubtaskUpdates(supabase, id, updates, {
      ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
      ...(body.handover !== undefined ? { handover: parseSubtaskHandover(body.handover as Record<string, unknown>) } : {}),
    });
    if (!subtask) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(subtask, 200, "Đã lưu lần bổ sung.");
  } catch (error) {
    return handleApiError(error);
  }
}
