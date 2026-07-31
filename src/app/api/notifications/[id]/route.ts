import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { markNotificationRead } from "@/lib/supabase/notifications";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const updated = await markNotificationRead(supabase, id, access.id);
    if (!updated) throw new ApiException("Không tìm thấy thông báo.", 404);
    return apiSuccess(true);
  } catch (error) {
    return handleApiError(error);
  }
}
