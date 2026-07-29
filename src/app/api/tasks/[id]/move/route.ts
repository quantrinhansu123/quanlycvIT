import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseTaskMoveInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { moveWorkTask } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { status, position } = parseTaskMoveInput(await readJsonObject(request));
    const task = await moveWorkTask(
      createApiSupabaseClient(request),
      id,
      status,
      position
    );
    return apiSuccess(task, 200, "Đã cập nhật vị trí công việc.");
  } catch (error) {
    return handleApiError(error);
  }
}
