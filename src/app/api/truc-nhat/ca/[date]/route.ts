import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { getDutyShiftByDate } from "@/lib/supabase/data";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface RouteParams {
  params: Promise<{ date: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { date } = await params;
    if (!DATE_PATTERN.test(date)) {
      throw new ApiException("Ngày trực phải có định dạng YYYY-MM-DD.", 400);
    }
    const supabase = createApiSupabaseClient(request);
    await requireRequestAccount(supabase);
    const shift = await getDutyShiftByDate(supabase, date);
    return apiSuccess(shift);
  } catch (error) {
    return handleApiError(error);
  }
}
