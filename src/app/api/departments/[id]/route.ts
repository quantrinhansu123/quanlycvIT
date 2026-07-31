import { revalidateTag } from "next/cache";
import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDepartmentInput } from "@/lib/api/department-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteDepartment, updateDepartment } from "@/lib/supabase/departments";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const department = await updateDepartment(
      supabase,
      id,
      parseDepartmentInput(await readJsonObject(request))
    );
    if (!department) throw new ApiException("Không tìm thấy phòng ban.", 404);
    revalidateTag("departments", { expire: 0 });
    return apiSuccess(department, 200, "Cập nhật phòng ban thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const deleted = await deleteDepartment(supabase, id);
    if (!deleted) throw new ApiException("Không tìm thấy phòng ban.", 404);
    revalidateTag("departments", { expire: 0 });
    return apiSuccess(true, 200, "Xóa phòng ban thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
