import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createAccount, listAccountDirectory } from "@/lib/supabase/accounts";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    return apiSuccess(await listAccountDirectory(supabase));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const account = await createAccount(
      supabase,
      parseAccountInput(await readJsonObject(request))
    );
    return apiSuccess(account, 201, "Thêm tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
