import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseFinanceInput } from "@/lib/api/finance-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { withFinanceClient } from "@/lib/supabase/finance-client";
import { deleteFinanceTransaction, updateFinanceTransaction } from "@/lib/supabase/finance";

interface RouteParams { params: Promise<{ id: string }>; }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const input = parseFinanceInput(await readJsonObject(request));
    const result = await withFinanceClient(main, (client) => updateFinanceTransaction(client, id, input));
    if (!result) throw new ApiException("Không tìm thấy giao dịch.", 404);
    return apiSuccess(result, 200, "Cập nhật giao dịch thành công.");
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const main = createApiSupabaseClient(request);
    await requireRequestAccount(main);
    const deleted = await withFinanceClient(main, (client) => deleteFinanceTransaction(client, id));
    if (!deleted) throw new ApiException("Không tìm thấy giao dịch.", 404);
    return apiSuccess(true, 200, "Xóa giao dịch thành công.");
  } catch (error) { return handleApiError(error); }
}
