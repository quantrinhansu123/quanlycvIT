import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { deleteAccount, getAccount, updateAccount } from "@/lib/supabase/accounts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const account = await getAccount(createApiSupabaseClient(request), id);
    if (!account) throw new ApiException("Không tìm thấy tài khoản.", 404);
    return apiSuccess(account);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const account = await updateAccount(
      createApiSupabaseClient(request),
      id,
      parseAccountInput(await readJsonObject(request))
    );
    if (!account) throw new ApiException("Không tìm thấy tài khoản.", 404);
    return apiSuccess(account, 200, "Cập nhật tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteAccount(createApiSupabaseClient(request), id);
    if (!deleted) throw new ApiException("Không tìm thấy tài khoản.", 404);
    return apiSuccess(true, 200, "Xóa tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
