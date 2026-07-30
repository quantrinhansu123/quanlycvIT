import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseWorkTaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  createWorkTask,
  listWorkTasks,
  listWorkTasksPage,
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
    const filters = filtersFromRequest(request);
    const params = request.nextUrl.searchParams;
    const page = params.get("page");
    const pageSize = params.get("pageSize");

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
    const input = parseWorkTaskInput(await readJsonObject(request));
    const task = await createWorkTask(createApiSupabaseClient(request), input);
    return apiSuccess(task, 201, "Tạo công việc thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
