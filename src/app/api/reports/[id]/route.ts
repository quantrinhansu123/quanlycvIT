import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { deleteTaskReport, getTaskReport } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const report = await getTaskReport(createApiSupabaseClient(request), id);
    if (!report) throw new ApiException("Không tìm thấy báo cáo.", 404);
    return apiSuccess(report);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteTaskReport(createApiSupabaseClient(request), id);
    if (!deleted) throw new ApiException("Không tìm thấy báo cáo.", 404);
    return apiSuccess(true, 200, "Xóa báo cáo thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
