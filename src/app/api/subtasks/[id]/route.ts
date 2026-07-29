import {
  ApiException,
  apiSuccess,
  handleApiError,
  readJsonObject,
} from "@/lib/api/response";
import { parseSubtaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  deleteSubtask,
  getSubtask,
  updateSubtask,
} from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const subtask = await getSubtask(createApiSupabaseClient(request), id);
    if (!subtask) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(subtask);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const input = parseSubtaskInput(await readJsonObject(request));
    const subtask = await updateSubtask(
      createApiSupabaseClient(request),
      id,
      input
    );
    if (!subtask) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(subtask, 200, "Cập nhật task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteSubtask(createApiSupabaseClient(request), id);
    if (!deleted) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(true, 200, "Xóa task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
