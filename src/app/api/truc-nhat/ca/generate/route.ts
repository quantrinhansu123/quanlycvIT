import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { generateDutySchedule } from "@/lib/supabase/data";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const body = await readJsonObject(request);
    const to = body.to;
    if (typeof to !== "string" || !DATE_PATTERN.test(to)) {
      throw new ApiException("Vui lòng truyền ngày kết thúc (to) theo định dạng YYYY-MM-DD.", 400);
    }
    await generateDutySchedule(supabase, to);
    return apiSuccess(true, 200, "Đã sinh thêm lịch trực.");
  } catch (error) {
    return handleApiError(error);
  }
}
