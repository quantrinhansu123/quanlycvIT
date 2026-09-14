import {
  ApiException,
  apiSuccess,
  handleApiError,
  readJsonObject,
} from "@/lib/api/response";
import { parseSubtaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import {
  acceptSubtaskAssignment,
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
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const subtask = await getSubtask(supabase, id);
    if (!subtask) throw new ApiException("Không tìm thấy task.", 404);
    return apiSuccess(subtask);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    if (access.role === "member") {
      const { data: assignment, error: assignmentError } = await supabase
        .from("task_phu_trach")
        .select("task_id")
        .eq("task_id", id)
        .eq("tai_khoan_id", access.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) {
        throw new ApiException("Tester chỉ được ghi kết quả test, không được chỉnh sửa Task.", 403);
      }
    }
    const input = parseSubtaskInput(await readJsonObject(request));
    if (input.status !== undefined) {
      const current = await getSubtask(supabase, id);
      if (!current) throw new ApiException("Không tìm thấy task.", 404);
      if (current.status === "done" && input.status !== "done") {
        throw new ApiException("Task đã hoàn thành nên không thể thay đổi trạng thái.", 400);
      }
    }
    if (input.status !== undefined && access.role === "manager") {
      throw new ApiException("Chỉ người được giao Task hoặc quản trị viên mới được chỉnh sửa trạng thái.", 403);
    }
    if (input.status === "done" && access.role !== "admin") {
      throw new ApiException("Chỉ quản trị viên mới được duyệt Task hoàn thành.", 403);
    }
    if (input.status === "inProgress" && access.role === "member") {
      await acceptSubtaskAssignment(supabase, id, access.id);
    }
    const subtask = await updateSubtask(
      supabase,
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
