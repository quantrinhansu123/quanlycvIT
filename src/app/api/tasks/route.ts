import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseWorkTaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import {
  createWorkTask,
  listWorkTasks,
  listWorkTasksPage,
  listWorkTaskOptions,
  type WorkTaskFilters,
} from "@/lib/supabase/data";
import type { TaskPriority, TaskStatus } from "@/types/task";

function filtersFromRequest(request: NextRequest): WorkTaskFilters {
  const params = request.nextUrl.searchParams;
  const assigneeIdsParam = params.get("assigneeIds");
  return {
    search: params.get("search") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    assigneeId: params.get("assigneeId") ?? undefined,
    assigneeIds: assigneeIdsParam ? assigneeIdsParam.split(",").filter(Boolean) : undefined,
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
    const fields = params.get("fields");

    if (fields === "options") {
      const options = await listWorkTaskOptions(supabase, filters);
      return apiSuccess(options);
    }

    if (page && pageSize) {
      const result = await listWorkTasksPage(supabase, {
        ...filters,
        page: Number(page),
        pageSize: Number(pageSize),
      });
      return apiSuccess(result);
    }

    const tasks = await listWorkTasks(supabase, filters);
    return apiSuccess(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const input = parseWorkTaskInput(await readJsonObject(request));
    const task = await createWorkTask(supabase, input);
    return apiSuccess(task, 201, "Tạo công việc thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
