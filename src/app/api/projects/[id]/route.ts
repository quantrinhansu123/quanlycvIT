import {
  ApiException,
  apiSuccess,
  handleApiError,
  readJsonObject,
} from "@/lib/api/response";
import { parseProjectInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const project = await getProject(createApiSupabaseClient(request), id);
    if (!project) throw new ApiException("Không tìm thấy dự án.", 404);
    return apiSuccess(project);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const input = parseProjectInput(await readJsonObject(request));
    const project = await updateProject(
      createApiSupabaseClient(request),
      id,
      input
    );
    if (!project) throw new ApiException("Không tìm thấy dự án.", 404);
    return apiSuccess(project, 200, "Cập nhật dự án thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteProject(createApiSupabaseClient(request), id);
    if (!deleted) throw new ApiException("Không tìm thấy dự án.", 404);
    return apiSuccess(true, 200, "Xóa dự án thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
