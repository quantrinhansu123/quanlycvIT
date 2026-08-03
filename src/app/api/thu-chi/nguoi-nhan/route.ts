import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { listBankTransferRecipients } from "@/lib/supabase/accounts";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    await requireRequestAccount(supabase);
    return apiSuccess(await listBankTransferRecipients(supabase));
  } catch (error) {
    return handleApiError(error);
  }
}
