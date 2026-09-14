import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createAccounts, updateAccountsStatus } from "@/lib/supabase/accounts";

const MAX_BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBatch(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiException(`${label} phải là mảng không rỗng.`, 400);
  }
  if (value.length > MAX_BATCH_SIZE) {
    throw new ApiException(`Mỗi lần chỉ xử lý tối đa ${MAX_BATCH_SIZE} tài khoản.`, 400);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const body = await readJsonObject(request);
    const inputs = readBatch(body.items, "Danh sách tài khoản").map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ApiException("Dữ liệu tài khoản không hợp lệ.", 400);
      }
      return parseAccountInput(item as Record<string, unknown>);
    });
    const accounts = await createAccounts(supabase, inputs);
    return apiSuccess(accounts, 201, `Đã thêm ${accounts.length} tài khoản.`);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const body = await readJsonObject(request);
    const status = body.status;
    if (status !== "active" && status !== "inactive") {
      throw new ApiException("Trạng thái tài khoản không hợp lệ.", 400);
    }
    const ids = readBatch(body.ids, "Danh sách mã tài khoản").map((id) => {
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
        throw new ApiException("Mã tài khoản không hợp lệ.", 400);
      }
      return id;
    });
    if (new Set(ids).size !== ids.length) {
      throw new ApiException("Danh sách tài khoản có mã bị trùng.", 400);
    }
    const accounts = await updateAccountsStatus(supabase, ids, status);
    return apiSuccess(accounts, 200, `Đã cập nhật ${accounts.length} tài khoản.`);
  } catch (error) {
    return handleApiError(error);
  }
}
