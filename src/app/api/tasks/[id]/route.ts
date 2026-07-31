import {
  ApiException,
  apiSuccess,
  handleApiError,
  readJsonObject,
} from "@/lib/api/response";
import { parseWorkTaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  assertManagerOrAdmin,
  assertWorkTaskReadable,
  requireRequestAccount,
} from "@/lib/supabase/authorization";
import {
  deleteWorkTask,
  getWorkTask,
  updateWorkTask,
} from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertWorkTaskReadable(supabase, access, id);
    const task = await getWorkTask(supabase, id);
    if (!task) throw new ApiException("Không tìm thấy công việc.", 404);
    return apiSuccess(task);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseWorkTaskInput(await readJsonObject(request));
    const task = await updateWorkTask(supabase, id, input);
    if (!task) throw new ApiException("Không tìm thấy công việc.", 404);
    return apiSuccess(task, 200, "Cập nhật công việc thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const deleted = await deleteWorkTask(supabase, id);
    if (!deleted) throw new ApiException("Không tìm thấy công việc.", 404);
    return apiSuccess(true, 200, "Xóa công việc thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
