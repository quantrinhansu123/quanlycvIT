import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createAccount, listAccountDirectory } from "@/lib/supabase/accounts";

export async function GET(request: Request) {
  try {
    return apiSuccess(await listAccountDirectory(createApiSupabaseClient(request)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await createAccount(
      createApiSupabaseClient(request),
      parseAccountInput(await readJsonObject(request))
    );
    return apiSuccess(account, 201, "Thêm tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
