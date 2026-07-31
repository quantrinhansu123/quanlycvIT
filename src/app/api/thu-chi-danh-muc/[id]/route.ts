import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceCategoryInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { deleteFinanceCategory, updateFinanceCategory } from "@/lib/supabase/finance";

interface RouteParams { params: Promise<{ id: string }>; }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = await updateFinanceCategory(createApiSupabaseClient(request), id, parseFinanceCategoryInput(await readJsonObject(request)));
    if (!result) throw new ApiException("Không tìm thấy danh mục.", 404);
    return apiSuccess(result, 200, "Cập nhật danh mục thành công.");
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!await deleteFinanceCategory(createApiSupabaseClient(request), id)) throw new ApiException("Không tìm thấy danh mục.", 404);
    return apiSuccess(true, 200, "Xóa danh mục thành công.");
  } catch (error) { return handleApiError(error); }
}
