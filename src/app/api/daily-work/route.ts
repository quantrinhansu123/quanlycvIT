import { ApiException, apiSuccess, handleApiError, throwDatabaseError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { dailyWorkRows, type DailyWorkTask } from "@/lib/daily-work";
import type { SubtaskTimeRecord } from "@/types/subtask";
import { decodeHandoverContent } from "@/lib/handover";

function detailTitlesFrom(task: { mo_ta: string | null; cap_nhat_bo_sung: unknown; ban_giao_noi_dung: string | null }): Record<string, string> {
  const titles: Record<string, string> = {};
  const descriptionTitle = (value: unknown) => typeof value === "string"
    ? value.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.replace(/^#{1,6}\s+/, "").slice(0, 120) || "Chi tiết chưa có tên"
    : "Chi tiết chưa có tên";
  titles.initial = descriptionTitle(task.mo_ta);
  if (Array.isArray(task.cap_nhat_bo_sung)) {
    for (const entry of task.cap_nhat_bo_sung) {
      if (entry && typeof entry.id === "string") titles[entry.id] = descriptionTitle(entry.description);
    }
  }
  for (const [id, title] of Object.entries(decodeHandoverContent(task.ban_giao_noi_dung).titles ?? {})) {
    if (title) titles[id] = title;
  }
  return titles;
}

function detailAssigneesFrom(banGiao: string | null): Record<string, string[]> {
  const rows = decodeHandoverContent(banGiao).rows ?? {};
  const result: Record<string, string[]> = {};
  for (const [detailId, row] of Object.entries(rows)) {
    const ids = row.assigneeIds?.filter((id) => typeof id === "string" && id.length > 0) ?? [];
    if (ids.length > 0) result[detailId] = [...new Set(ids)];
  }
  return result;
}

function taskAssigneeIds(assignments: { tai_khoan_id: string; la_chinh?: boolean | null }[] | null | undefined): string[] {
  const list = assignments ?? [];
  return [...new Set([
    ...list.filter((row) => row.la_chinh).map((row) => row.tai_khoan_id),
    ...list.map((row) => row.tai_khoan_id),
  ].filter(Boolean))];
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function recordsFrom(value: unknown): SubtaskTimeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is SubtaskTimeRecord => r && typeof r === "object" && typeof r.id === "string" && typeof r.at === "string" && ["start", "pause", "end"].includes(r.type) && (r.actorId === undefined || typeof r.actorId === "string") && (r.detailId === undefined || typeof r.detailId === "string"));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveAssigneeRefs(
  supabase: ReturnType<typeof createApiSupabaseClient>,
  tasks: DailyWorkTask[],
): Promise<DailyWorkTask[]> {
  const codes = new Set<string>();
  for (const task of tasks) {
    for (const id of task.assigneeIds ?? []) if (!UUID_RE.test(id)) codes.add(id);
    for (const ids of Object.values(task.detailAssignees ?? {})) {
      for (const id of ids) if (!UUID_RE.test(id)) codes.add(id);
    }
  }
  const codeToId = new Map<string, string>();
  if (codes.size > 0) {
    const { data, error } = await supabase.from("tai_khoan").select("id,ma_nv").in("ma_nv", [...codes]);
    throwDatabaseError(error);
    for (const account of data ?? []) if (account.ma_nv) codeToId.set(account.ma_nv, account.id);
  }
  const toAccountIds = (ids: string[]) =>
    [...new Set(ids.map((id) => (UUID_RE.test(id) ? id : codeToId.get(id))).filter((id): id is string => Boolean(id)))];
  return tasks.map((task) => ({
    ...task,
    assigneeIds: toAccountIds(task.assigneeIds ?? []),
    detailAssignees: Object.fromEntries(
      Object.entries(task.detailAssignees ?? {})
        .map(([detailId, ids]) => [detailId, toAccountIds(ids)] as const)
        .filter(([, ids]) => ids.length > 0),
    ),
  }));
}

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    const params = new URL(request.url).searchParams;
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!validDate(start) || !validDate(end) || start > end || Date.parse(end) - Date.parse(start) > 365 * 86_400_000) {
      throw new ApiException("Chọn khoảng ngày hợp lệ, tối đa 366 ngày.", 400);
    }
    const tasks: DailyWorkTask[] = [];
    // Read all pages so the database row limit cannot silently truncate totals.
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from("task")
        .select(`id,ten_task,time_records,mo_ta,cap_nhat_bo_sung,ban_giao_noi_dung,task_phu_trach${access.role === "member" ? "!inner" : ""}(tai_khoan_id,la_chinh)`)
        .order("id").range(offset, offset + 499);
      if (access.role === "member") query = query.eq("task_phu_trach.tai_khoan_id", access.id);
      const { data, error } = await query;
      throwDatabaseError(error);
      const page = (data ?? []) as unknown as {
        id: string;
        ten_task: string;
        time_records: unknown;
        mo_ta: string | null;
        cap_nhat_bo_sung: unknown;
        ban_giao_noi_dung: string | null;
        task_phu_trach?: { tai_khoan_id: string; la_chinh?: boolean | null }[] | null;
      }[];
      tasks.push(...page.map((task) => ({
        id: task.id,
        title: task.ten_task,
        records: recordsFrom(task.time_records),
        assigneeIds: taskAssigneeIds(task.task_phu_trach),
        detailAssignees: detailAssigneesFrom(task.ban_giao_noi_dung),
        detailTitles: detailTitlesFrom(task),
      })));
      if (page.length < 500) break;
    }
    const resolvedTasks = await resolveAssigneeRefs(supabase, tasks);
    const now = Date.now();
    const rows = dailyWorkRows(resolvedTasks, start, end, {}, now).filter((row) => access.role !== "member" || row.employeeId === access.id);
    const ids = [...new Set(rows.map((row) => row.employeeId).filter(Boolean))];
    const names: Record<string, string> = {};
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { data, error } = await supabase.from("tai_khoan").select("id,ten_nv").in("id", ids.slice(offset, offset + 200));
      throwDatabaseError(error);
      for (const account of data ?? []) names[account.id] = account.ten_nv;
    }
    return apiSuccess(rows.map((row) => ({ ...row, employeeName: names[row.employeeId] || row.employeeName })));
  } catch (error) {
    return handleApiError(error);
  }
}
