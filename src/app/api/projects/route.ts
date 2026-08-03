import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseProjectInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createProject, listProjectDirectory, listProjects, listProjectsPage } from "@/lib/supabase/data";
import { readIdempotencyKey, withIdempotency } from "@/lib/supabase/idempotency";
import type { Project } from "@/types/project";

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const participantAccountId = access.role === "member" ? access.id : undefined;
    const params = request.nextUrl.searchParams;
    if (params.get("directory") === "true") {
      return apiSuccess(await listProjectDirectory(supabase, participantAccountId));
    }
    const search = params.get("q") ?? undefined;
    const page = params.get("page");
    const pageSize = params.get("pageSize");

    if (page && pageSize) {
      const managerIdsParam = params.get("managerIds");
      const managerIds = managerIdsParam
        ? managerIdsParam.split(",").filter(Boolean)
        : undefined;

      const result = await listProjectsPage(supabase, {
        search,
        managerIds,
        participantAccountId,
        page: Number(page),
        pageSize: Number(pageSize),
      });
      return apiSuccess(result);
    }

    const projects = await listProjects(supabase, search, participantAccountId);
    return apiSuccess(projects);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const idempotencyKey = readIdempotencyKey(request);
    const input = parseProjectInput(await readJsonObject(request));
    const { status, body } = await withIdempotency<Project>(
      supabase,
      { accountId: access.id, idempotencyKey, scope: "create-project" },
      async () => ({ status: 201, body: await createProject(supabase, input) })
    );
    return apiSuccess(body, status, "Tạo dự án thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
