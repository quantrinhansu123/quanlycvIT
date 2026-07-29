import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseWorkTaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  createWorkTask,
  listWorkTasks,
  type WorkTaskFilters,
} from "@/lib/supabase/data";
import type { TaskPriority, TaskStatus } from "@/types/task";

function filtersFromRequest(request: NextRequest): WorkTaskFilters {
  const params = request.nextUrl.searchParams;
  return {
    search: params.get("search") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    assigneeId: params.get("assigneeId") ?? undefined,
    priority: (params.get("priority") as TaskPriority | null) ?? undefined,
    status: (params.get("status") as TaskStatus | null) ?? undefined,
    overdueOnly: params.get("overdueOnly") === "true",
  };
}

export async function GET(request: NextRequest) {
  try {
    const tasks = await listWorkTasks(
      createApiSupabaseClient(request),
      filtersFromRequest(request)
    );
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
