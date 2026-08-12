import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertTesterOfSubtask, submitSubtaskTestResult } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJsonObject(request);
    if (typeof body.passed !== "boolean") {
      throw new ApiException("Kết quả test phải là Pass hoặc Fail.", 400);
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new ApiException("Ghi chú test phải là chuỗi.", 400);
    }
    const supabase = createApiSupabaseClient(request);
    await assertTesterOfSubtask(supabase, id);
    const subtask = await submitSubtaskTestResult(supabase, id, {
      passed: body.passed,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    if (!subtask) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(subtask, 200, body.passed ? "Task đã Pass kiểm thử." : "Task đã được trả lại để sửa lỗi.");
  } catch (error) {
    return handleApiError(error);
  }
}
