import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDutyChecklistTemplateInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteDutyChecklistTemplate, updateDutyChecklistTemplate } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseDutyChecklistTemplateInput(await readJsonObject(request));
    const template = await updateDutyChecklistTemplate(supabase, id, input);
    if (!template) throw new ApiException("Không tìm thấy đầu việc mẫu.", 404);
    return apiSuccess(template, 200, "Cập nhật đầu việc mẫu thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const deleted = await deleteDutyChecklistTemplate(supabase, id);
    if (!deleted) throw new ApiException("Không tìm thấy đầu việc mẫu.", 404);
    return apiSuccess(true, 200, "Xóa đầu việc mẫu thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
