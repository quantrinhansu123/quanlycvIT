import {
  ApiException,
  apiSuccess,
  handleApiError,
} from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listTaskReports } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reports = await listTaskReports(createApiSupabaseClient(request), id);
    return apiSuccess(reports);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  return handleApiError(
    new ApiException(
      "Tiến độ công việc được tính tự động từ các Task. Chỉ được báo cáo tiến độ ở cấp Task.",
      405
    )
  );
}
