import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseProjectInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { createProject, listProjects } from "@/lib/supabase/data";

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    const projects = await listProjects(
      supabase,
      request.nextUrl.searchParams.get("q") ?? undefined
    );
    return apiSuccess(projects);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const input = parseProjectInput(await readJsonObject(request));
    const project = await createProject(supabase, input);
    return apiSuccess(project, 201, "Tạo dự án thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
