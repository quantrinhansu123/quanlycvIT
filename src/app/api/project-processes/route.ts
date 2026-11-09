import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { listProjectDirectory } from "@/lib/supabase/data";
import { listProjectProcesses, parseProjectProcess, saveProjectProcess } from "@/lib/supabase/project-processes";

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const projects = await listProjectDirectory(supabase, access.role === "member" ? access.id : undefined);
    const result = await listProjectProcesses(supabase, projects.map((project) => project.id));
    return apiSuccess({ ...result, projects });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseProjectProcess(await readJsonObject(request));
    const { data, error } = await supabase.from("du_an").select("id").eq("id", input.projectId).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiException("Không tìm thấy dự án.", 404);
    return apiSuccess(await saveProjectProcess(supabase, input), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
