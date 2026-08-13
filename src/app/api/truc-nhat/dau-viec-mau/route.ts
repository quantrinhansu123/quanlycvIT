import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDutyChecklistTemplateInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createDutyChecklistTemplate, listDutyChecklistTemplates } from "@/lib/supabase/data";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    await requireRequestAccount(supabase);
    const templates = await listDutyChecklistTemplates(supabase);
    return apiSuccess(templates);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseDutyChecklistTemplateInput(await readJsonObject(request));
    const template = await createDutyChecklistTemplate(supabase, input);
    return apiSuccess(template, 201, "Tạo đầu việc mẫu thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
