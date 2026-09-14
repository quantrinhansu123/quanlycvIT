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
import type { Subtask } from "@/types/subtask";
import { readIdempotencyKey, withIdempotency } from "@/lib/supabase/idempotency";

function filtersFromRequest(request: NextRequest): SubtaskFilters {
  const params = request.nextUrl.searchParams;
  const statuses = params.get("statuses")
    ?.split(",")
    .filter(Boolean) as TaskStatus[] | undefined;
  const priorities = params.get("priorities")
    ?.split(",")
    .filter(Boolean) as TaskPriority[] | undefined;
  return {
    search: params.get("search") ?? undefined,
    workTaskId: params.get("workTaskId") ?? undefined,
    assigneeId: params.get("assigneeId") ?? undefined,
    priority: (params.get("priority") as TaskPriority | null) ?? undefined,
    priorities: priorities?.length ? priorities : undefined,
    status: (params.get("status") as TaskStatus | null) ?? undefined,
    statuses: statuses?.length ? statuses : undefined,
    overdueOnly: params.get("overdueOnly") === "true",
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const filters = filtersFromRequest(request);
    const needsTesting = request.nextUrl.searchParams.get("needsTesting") === "true";
    if (needsTesting) {
      filters.testerId = access.id;
      filters.status = "testing";
      filters.statuses = undefined;
      filters.assigneeId = undefined;
      filters.assigneeIds = undefined;
    } else if (access.role === "member") {
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
      if (access.role === "member" && !needsTesting) assigneeIds = [access.id];

      const result = await listSubtasksPage(supabase, {
        ...filters,
        projectId,
        workTaskIds,
        assigneeIds,
        testerId: needsTesting ? access.id : undefined,
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
    const supabase = createApiSupabaseClient(request);
    // Route này không giới hạn theo vai trò (khác /api/projects, /api/tasks) —
    // giữ nguyên hành vi cũ, chỉ thêm requireRequestAccount để lấy accountId cho
    // idempotency; quyền tạo task con vẫn do assertWorkTaskAssignees trong
    // createSubtask() quyết định như trước.
    const access = await requireRequestAccount(supabase);
    const idempotencyKey = readIdempotencyKey(request);
    const input = parseSubtaskInput(await readJsonObject(request));
    const { status, body } = await withIdempotency<Subtask>(
      supabase,
      { accountId: access.id, idempotencyKey, scope: "create-subtask" },
      async () => ({ status: 201, body: await createSubtask(supabase, input, access.id) })
    );
    return apiSuccess(body, status, "Tạo task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
