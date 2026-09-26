import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { appendSubtaskTimeRecord, listSubtaskTimeRecords } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    return apiSuccess(await listSubtaskTimeRecords(supabase, id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const body = await readJsonObject(request);
    if (body.type !== "start" && body.type !== "pause" && body.type !== "end") {
      throw new ApiException("Mốc thời gian không hợp lệ.", 400);
    }
    const records = await appendSubtaskTimeRecord(supabase, id, body.type, access.id);
    if (!records) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(records, 200, "Đã ghi nhận mốc thời gian.");
  } catch (error) {
    return handleApiError(error);
  }
}
