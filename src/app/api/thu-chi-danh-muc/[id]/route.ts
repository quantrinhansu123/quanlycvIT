import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceCategoryInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { deleteFinanceCategory, updateFinanceCategory } from "@/lib/supabase/finance";

interface RouteParams { params: Promise<{ id: string }>; }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const input = parseFinanceCategoryInput(await readJsonObject(request));
    const result = await withFinanceClient(main, (client) => updateFinanceCategory(client, id, input));
    if (!result) throw new ApiException("Không tìm thấy danh mục.", 404);
    return apiSuccess(result, 200, "Cập nhật danh mục thành công.");
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const deleted = await withFinanceClient(main, (client) => deleteFinanceCategory(client, id));
    if (!deleted) throw new ApiException("Không tìm thấy danh mục.", 404);
    return apiSuccess(true, 200, "Xóa danh mục thành công.");
  } catch (error) { return handleApiError(error); }
}
