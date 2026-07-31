import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { deleteFinanceTransaction, updateFinanceTransaction } from "@/lib/supabase/finance";

interface RouteParams { params: Promise<{ id: string }>; }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const result = await updateFinanceTransaction(createApiSupabaseClient(request), id, parseFinanceInput(await readJsonObject(request)));
    if (!result) throw new ApiException("Không tìm thấy giao dịch.", 404);
    return apiSuccess(result, 200, "Cập nhật giao dịch thành công.");
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!await deleteFinanceTransaction(createApiSupabaseClient(request), id)) throw new ApiException("Không tìm thấy giao dịch.", 404);
    return apiSuccess(true, 200, "Xóa giao dịch thành công.");
  } catch (error) { return handleApiError(error); }
}
