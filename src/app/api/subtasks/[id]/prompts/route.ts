import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskPromptItems } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { getSubtaskPromptItems, updateSubtaskPromptItems } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    return apiSuccess(await getSubtaskPromptItems(supabase, id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertSubtaskReadable(supabase, access, id);
    const items = parseSubtaskPromptItems(await readJsonObject(request));
    const updated = await updateSubtaskPromptItems(supabase, id, items);
    if (!updated) throw new ApiException("Không tìm thấy Task.", 404);
    return apiSuccess(updated, 200, "Đã lưu Prompt.");
  } catch (error) {
    return handleApiError(error);
  }
}
