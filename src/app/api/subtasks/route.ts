import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import {
  createSubtask,
  listSubtasks,
  listSubtasksPage,
  type SubtaskFilters,
} from "@/lib/supabase/data";
import type { TaskPriority, TaskStatus } from "@/types/task";

function filtersFromRequest(request: NextRequest): SubtaskFilters {
  const params = request.nextUrl.searchParams;
  return {
    search: params.get("search") ?? undefined,
    workTaskId: params.get("workTaskId") ?? undefined,
    assigneeId: params.get("assigneeId") ?? undefined,
    priority: (params.get("priority") as TaskPriority | null) ?? undefined,
    status: (params.get("status") as TaskStatus | null) ?? undefined,
    overdueOnly: params.get("overdueOnly") === "true",
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const filters = filtersFromRequest(request);
    if (access.role === "member") {
      filters.assigneeId = undefined;
      filters.assigneeIds = [access.id];
    }
    const params = request.nextUrl.searchParams;
    const page = params.get("page");
    const pageSize = params.get("pageSize");

    if (page && pageSize) {
      const projectId = params.get("projectId") ?? undefined;
      const workTaskIdsParam = params.get("workTaskIds");
      const workTaskIds = workTaskIdsParam
        ? workTaskIdsParam.split(",").filter(Boolean)
        : undefined;
      const assigneeIdsParam = params.get("assigneeIds");
      let assigneeIds = assigneeIdsParam
        ? assigneeIdsParam.split(",").filter(Boolean)
        : undefined;
      if (access.role === "member") assigneeIds = [access.id];

      const result = await listSubtasksPage(supabase, {
        ...filters,
        projectId,
        workTaskIds,
        assigneeIds,
        page: Number(page),
        pageSize: Number(pageSize),
      });
      return apiSuccess(result);
    }

    const subtasks = await listSubtasks(supabase, filters);
    return apiSuccess(subtasks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parseSubtaskInput(await readJsonObject(request));
    const subtask = await createSubtask(createApiSupabaseClient(request), input);
    return apiSuccess(subtask, 201, "Tạo task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
