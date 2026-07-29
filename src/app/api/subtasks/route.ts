import type { NextRequest } from "next/server";
import { apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseSubtaskInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  createSubtask,
  listSubtasks,
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
    const subtasks = await listSubtasks(
      createApiSupabaseClient(request),
      filtersFromRequest(request)
    );
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
