import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { listNotifications } from "@/lib/supabase/notifications";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    return apiSuccess(await listNotifications(supabase, access.id));
  } catch (error) {
    return handleApiError(error);
  }
}
