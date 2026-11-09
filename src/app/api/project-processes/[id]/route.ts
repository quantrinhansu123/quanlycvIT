import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { parseProjectProcess, saveProjectProcess } from "@/lib/supabase/project-processes";

interface RouteParams { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseProjectProcess(await readJsonObject(request));
    const { data: project, error } = await supabase.from("du_an").select("id").eq("id", input.projectId).maybeSingle();
    if (error) throw error;
    if (!project) throw new ApiException("Không tìm thấy dự án.", 404);
    return apiSuccess(await saveProjectProcess(supabase, input, id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const { data, error } = await supabase.from("quy_trinh_du_an").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiException("Không tìm thấy quy trình.", 404);
    return apiSuccess(true);
  } catch (error) {
    return handleApiError(error);
  }
}
