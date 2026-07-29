import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import {
  DEFAULT_PROJECT_STEPS,
  type Project,
  type ProjectColor,
  type ProjectInput,
  type ProjectMember,
  type ProjectStepConfig,
} from "@/types/project";
import type { Subtask, SubtaskInput, SubtaskReport } from "@/types/subtask";
import type {
  TaskPriority,
  TaskReport,
  TaskReportAttachment,
  TaskReportLink,
  TaskStatus,
  WorkTask,
  WorkTaskInput,
} from "@/types/task";
import type { ProjectTask } from "@/services/mock-data";
import { getAppDateKey } from "@/lib/utils";

interface AccountRow {
  id: string;
  ma_nv: string;
  ten_nv: string;
  chuc_vu: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface ProjectRow {
  id: string;
  ma_da: string;
  ten_da: string;
  hop_mau: string;
  mo_ta: string | null;
  ngay_bd: string | null;
  ngay_kt: string | null;
  nguoi_ql_id: string | null;
  steps: unknown;
}

interface ProjectMemberRow {
  du_an_id: string;
  tai_khoan_id: string;
}

interface ProjectManagerRow {
  du_an_id: string;
  tai_khoan_id: string;
  la_chinh: boolean;
}

interface ProjectTaskStatsRow {
  id: string;
  du_an_id: string;
  trang_thai: string;
  ngay_hoan_thanh: string | null;
}

interface WorkTaskRow {
  id: string;
  ten_cv: string;
  mo_ta: string | null;
  created_at: string;
  updated_at: string;
  du_an_id: string;
  nguoi_phu_trach_id: string | null;
  trang_thai: string;
  uu_tien: string;
  ngay_bat_dau: string | null;
  ngay_hoan_thanh: string | null;
  tien_do_thuc_te: number;
  nhan_tag: string[] | null;
  cong_viec_tien_de_id: string | null;
}

interface SubtaskRow {
  id: string;
  ten_task: string;
  mo_ta: string | null;
  created_at: string;
  updated_at: string;
  ngay_bat_dau: string | null;
  ngay_ket_thuc: string | null;
  nguoi_phu_trach_id: string | null;
  trang_thai: string;
  uu_tien: string;
  tien_do_thuc_te: number;
  nhan_tag: string[] | null;
  task_tien_de_id: string | null;
  cong_viec_id: string;
}

interface WorkTaskProgressRow {
  cong_viec_id: string;
  tien_do_thuc_te: number;
}

export interface WorkTaskFilters {
  search?: string;
  projectId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

export interface TaskReportAttachmentInput {
  kind: TaskReportAttachment["kind"];
  fileName: string;
  /** Storage path trong bucket "bao-cao". */
  path: string;
  mimeType?: string;
  size?: number;
}

export interface TaskReportInput {
  authorId?: string;
  content: string;
  progress: number;
  attachments: TaskReportAttachmentInput[];
  links: Omit<TaskReportLink, "id">[];
}

export interface SubtaskFilters {
  search?: string;
  workTaskId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

const ACCOUNT_SELECT = "id,ma_nv,ten_nv,chuc_vu,email,avatar_url";
const PROJECT_SELECT =
  "id,ma_da,ten_da,hop_mau,mo_ta,ngay_bd,ngay_kt,nguoi_ql_id,steps";
const WORK_TASK_SELECT =
  "id,ten_cv,mo_ta,created_at,updated_at,du_an_id,nguoi_phu_trach_id,trang_thai,uu_tien,ngay_bat_dau,ngay_hoan_thanh,tien_do_thuc_te,nhan_tag,cong_viec_tien_de_id";
const SUBTASK_SELECT =
  "id,ten_task,mo_ta,created_at,updated_at,ngay_bat_dau,ngay_ket_thuc,nguoi_phu_trach_id,trang_thai,uu_tien,tien_do_thuc_te,nhan_tag,task_tien_de_id,cong_viec_id";

function avatarColor(value: string): string {
  const colors = ["#F59E0B", "#1F2937", "#DC2626", "#0EA5E9", "#16A34A", "#7C5CFC"];
  const hash = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function accountReference(account: AccountRow): string {
  return account.ma_nv || account.id;
}

function toProjectMember(account: AccountRow): ProjectMember {
  return {
    id: accountReference(account),
    name: account.ten_nv,
    role: account.chuc_vu ?? undefined,
    email: account.email ?? undefined,
    avatarColor: avatarColor(account.id),
  };
}

function emptyProjectMember(): ProjectMember {
  return {
    id: "",
    name: "Chưa phân công",
    avatarColor: "#9CA3AF",
  };
}

function toApiStatus(status: string): TaskStatus {
  return status === "in_progress" ? "inProgress" : (status as TaskStatus);
}

function toDatabaseStatus(status: TaskStatus): string {
  return status === "inProgress" ? "in_progress" : status;
}

function toPriority(priority: string): TaskPriority {
  return priority as TaskPriority;
}

function projectColor(color: string): ProjectColor {
  return ["purple", "green", "orange", "red", "blue"].includes(color)
    ? (color as ProjectColor)
    : "purple";
}

function projectSteps(value: unknown): ProjectStepConfig[] {
  if (!Array.isArray(value)) return DEFAULT_PROJECT_STEPS;
  const valid = value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).key === "string" &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).enabled === "boolean"
  );
  return valid ? (value as ProjectStepConfig[]) : DEFAULT_PROJECT_STEPS;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadAccounts(
  supabase: ApiSupabaseClient,
  ids: string[]
): Promise<Map<string, AccountRow>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("tai_khoan")
    .select(ACCOUNT_SELECT)
    .in("id", ids);
  throwDatabaseError(error);

  const accounts = (data ?? []) as AccountRow[];
  return new Map(accounts.map((account) => [account.id, account]));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveAccountId(
  supabase: ApiSupabaseClient,
  reference: string,
  label: string
): Promise<string> {
  let query = supabase.from("tai_khoan").select("id");
  query = isUuid(reference)
    ? query.eq("id", reference)
    : query.eq("ma_nv", reference);

  const { data, error } = await query.maybeSingle();
  throwDatabaseError(error);
  if (!data) {
    throw new ApiException(`${label} không tồn tại trong bảng tài khoản.`, 400);
  }
  return data.id as string;
}

async function resolveAccountIds(
  supabase: ApiSupabaseClient,
  references: string[],
  label: string
): Promise<string[]> {
  return Promise.all(
    [...new Set(references)].map((reference) =>
      resolveAccountId(supabase, reference, label)
    )
  );
}

async function hydrateProjects(
  supabase: ApiSupabaseClient,
  rows: ProjectRow[]
): Promise<Project[]> {
  if (rows.length === 0) return [];

  const projectIds = rows.map((row) => row.id);
  const [
    { data: managerData, error: managerError },
    { data: memberData, error: memberError },
    { data: taskData, error: taskError },
  ] =
    await Promise.all([
      supabase
        .from("du_an_quan_ly")
        .select("du_an_id,tai_khoan_id,la_chinh")
        .in("du_an_id", projectIds),
      supabase
        .from("du_an_thanh_vien")
        .select("du_an_id,tai_khoan_id")
        .in("du_an_id", projectIds),
      supabase
        .from("cong_viec")
        .select("id,du_an_id,trang_thai,ngay_hoan_thanh")
        .in("du_an_id", projectIds),
    ]);

  throwDatabaseError(managerError);
  throwDatabaseError(memberError);
  throwDatabaseError(taskError);

  const managerAssignments = (managerData ?? []) as ProjectManagerRow[];
  const memberships = (memberData ?? []) as ProjectMemberRow[];
  const taskStats = (taskData ?? []) as ProjectTaskStatsRow[];
  const accountIds = uniqueValues([
    ...rows.map((row) => row.nguoi_ql_id),
    ...managerAssignments.map((row) => row.tai_khoan_id),
    ...memberships.map((row) => row.tai_khoan_id),
  ]);
  const accounts = await loadAccounts(supabase, accountIds);
  const today = getAppDateKey();

  return rows.map((row) => {
    const projectTasks = taskStats.filter((task) => task.du_an_id === row.id);
    const managers = managerAssignments
      .filter((assignment) => assignment.du_an_id === row.id)
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => accounts.get(assignment.tai_khoan_id))
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    // Dữ liệu cũ chưa có bản ghi liên kết vẫn đọc được từ nguoi_ql_id.
    if (managers.length === 0 && row.nguoi_ql_id) {
      const legacyManager = accounts.get(row.nguoi_ql_id);
      if (legacyManager) managers.push(toProjectMember(legacyManager));
    }
    const managerAccountIds = new Set(
      managerAssignments
        .filter((assignment) => assignment.du_an_id === row.id)
        .map((assignment) => assignment.tai_khoan_id)
    );
    if (row.nguoi_ql_id) managerAccountIds.add(row.nguoi_ql_id);
    const members = memberships
      .filter(
        (membership) =>
          membership.du_an_id === row.id &&
          !managerAccountIds.has(membership.tai_khoan_id)
      )
      .map((membership) => accounts.get(membership.tai_khoan_id))
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);

    const doneTaskCount = projectTasks.filter(
      (task) => task.trang_thai === "done"
    ).length;
    const status: Project["status"] =
      projectTasks.length > 0 && doneTaskCount === projectTasks.length
        ? "done"
        : row.ngay_kt && row.ngay_kt < today
          ? "overdue"
          : row.ngay_bd && row.ngay_bd > today
            ? "notStarted"
            : "inProgress";

    return {
      id: row.id,
      code: row.ma_da,
      name: row.ten_da,
      description: row.mo_ta ?? undefined,
      color: projectColor(row.hop_mau),
      steps: projectSteps(row.steps),
      startDate: row.ngay_bd ?? "",
      endDate: row.ngay_kt ?? "",
      status,
      managers,
      manager: managers[0] ?? emptyProjectMember(),
      members,
      stats: {
        total: projectTasks.length,
        done: doneTaskCount,
        inProgress: projectTasks.filter((task) => task.trang_thai === "in_progress")
          .length,
        overdue: projectTasks.filter(
          (task) =>
            task.trang_thai !== "done" &&
            Boolean(task.ngay_hoan_thanh) &&
            task.ngay_hoan_thanh! < today
        ).length,
      },
    };
  });
}

async function syncProjectMembers(
  supabase: ApiSupabaseClient,
  projectId: string,
  memberIds: string[]
): Promise<void> {
  const { data: currentData, error: currentError } = await supabase
    .from("du_an_thanh_vien")
    .select("tai_khoan_id")
    .eq("du_an_id", projectId);
  throwDatabaseError(currentError);

  const currentIds = (currentData ?? []).map((row) => row.tai_khoan_id as string);
  const newIds = memberIds.filter((id) => !currentIds.includes(id));
  const removedIds = currentIds.filter((id) => !memberIds.includes(id));

  if (newIds.length > 0) {
    const { error } = await supabase.from("du_an_thanh_vien").insert(
      newIds.map((accountId) => ({
        du_an_id: projectId,
        tai_khoan_id: accountId,
      }))
    );
    throwDatabaseError(error);
  }

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("du_an_thanh_vien")
      .delete()
      .eq("du_an_id", projectId)
      .in("tai_khoan_id", removedIds);
    throwDatabaseError(error);
  }
}

async function syncProjectManagers(
  supabase: ApiSupabaseClient,
  projectId: string,
  managerIds: string[]
): Promise<void> {
  const { data: currentData, error: currentError } = await supabase
    .from("du_an_quan_ly")
    .select("tai_khoan_id")
    .eq("du_an_id", projectId);
  throwDatabaseError(currentError);

  const currentIds = (currentData ?? []).map((row) => row.tai_khoan_id as string);
  const newIds = managerIds.filter((id) => !currentIds.includes(id));
  const removedIds = currentIds.filter((id) => !managerIds.includes(id));

  if (newIds.length > 0) {
    const { error } = await supabase.from("du_an_quan_ly").insert(
      newIds.map((accountId) => ({
        du_an_id: projectId,
        tai_khoan_id: accountId,
        la_chinh: false,
      }))
    );
    throwDatabaseError(error);
  }

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("du_an_quan_ly")
      .delete()
      .eq("du_an_id", projectId)
      .in("tai_khoan_id", removedIds);
    throwDatabaseError(error);
  }

  const { error: resetPrimaryError } = await supabase
    .from("du_an_quan_ly")
    .update({ la_chinh: false })
    .eq("du_an_id", projectId)
    .eq("la_chinh", true);
  throwDatabaseError(resetPrimaryError);

  const { error: primaryError } = await supabase
    .from("du_an_quan_ly")
    .update({ la_chinh: true })
    .eq("du_an_id", projectId)
    .eq("tai_khoan_id", managerIds[0]);
  throwDatabaseError(primaryError);
}

export async function listProjects(
  supabase: ApiSupabaseClient,
  search?: string
): Promise<Project[]> {
  let query = supabase
    .from("du_an")
    .select(PROJECT_SELECT)
    .order("created_at", { ascending: false });

  const term = search?.trim();
  if (term) {
    const safeTerm = term.replace(/[,().%_]/g, " ").trim();
    if (safeTerm) {
      query = query.or(`ten_da.ilike.%${safeTerm}%,ma_da.ilike.%${safeTerm}%`);
    }
  }

  const { data, error } = await query;
  throwDatabaseError(error);
  return hydrateProjects(supabase, (data ?? []) as ProjectRow[]);
}

export async function getProject(
  supabase: ApiSupabaseClient,
  id: string
): Promise<Project | null> {
  const { data, error } = await supabase
    .from("du_an")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;
  const [project] = await hydrateProjects(supabase, [data as ProjectRow]);
  return project;
}

export async function createProject(
  supabase: ApiSupabaseClient,
  input: ProjectInput
): Promise<Project> {
  const managerIds = await resolveAccountIds(
    supabase,
    input.managerIds,
    "Người quản lý"
  );
  const resolvedMemberIds = await resolveAccountIds(
    supabase,
    input.memberIds,
    "Thành viên dự án"
  );
  const memberIds = resolvedMemberIds.filter((id) => !managerIds.includes(id));

  const { data, error } = await supabase
    .from("du_an")
    .insert({
      ma_da: input.code,
      ten_da: input.name,
      hop_mau: input.color,
      mo_ta: input.description ?? null,
      ngay_bd: input.startDate,
      ngay_kt: input.endDate,
      nguoi_ql_id: managerIds[0],
      steps: input.steps,
    })
    .select(PROJECT_SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về dự án vừa tạo.", 500);

  try {
    await syncProjectManagers(supabase, data.id as string, managerIds);
    await syncProjectMembers(supabase, data.id as string, memberIds);
  } catch (syncError) {
    await supabase.from("du_an").delete().eq("id", data.id);
    throw syncError;
  }

  const project = await getProject(supabase, data.id as string);
  if (!project) throw new ApiException("Không thể đọc lại dự án vừa tạo.", 500);
  return project;
}

export async function updateProject(
  supabase: ApiSupabaseClient,
  id: string,
  input: ProjectInput
): Promise<Project | null> {
  const managerIds = await resolveAccountIds(
    supabase,
    input.managerIds,
    "Người quản lý"
  );
  const resolvedMemberIds = await resolveAccountIds(
    supabase,
    input.memberIds,
    "Thành viên dự án"
  );
  const memberIds = resolvedMemberIds.filter((id) => !managerIds.includes(id));

  const { data, error } = await supabase
    .from("du_an")
    .update({
      ma_da: input.code,
      ten_da: input.name,
      hop_mau: input.color,
      mo_ta: input.description ?? null,
      ngay_bd: input.startDate,
      ngay_kt: input.endDate,
      nguoi_ql_id: managerIds[0],
      steps: input.steps,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncProjectManagers(supabase, id, managerIds);
  await syncProjectMembers(supabase, id, memberIds);
  return getProject(supabase, id);
}

export async function deleteProject(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("du_an")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

export async function listDirectory(
  supabase: ApiSupabaseClient
): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("tai_khoan")
    .select(ACCOUNT_SELECT)
    .eq("status", "active")
    .order("ten_nv");
  throwDatabaseError(error);
  return ((data ?? []) as AccountRow[]).map(toProjectMember);
}

interface AssignmentRow {
  tai_khoan_id: string;
  la_chinh: boolean;
}

/**
 * Đọc danh sách người phụ trách từ bảng nối, xếp người chính lên đầu.
 * `ownerColumn` là cột khóa ngoại trỏ về bản ghi cha (cong_viec_id hoặc task_id).
 */
async function loadAssignments(
  supabase: ApiSupabaseClient,
  table: "cong_viec_phu_trach" | "task_phu_trach",
  ownerColumn: "cong_viec_id" | "task_id",
  ownerIds: string[]
): Promise<Map<string, ProjectMember[]>> {
  const result = new Map<string, ProjectMember[]>();
  if (ownerIds.length === 0) return result;

  const { data, error } = await supabase
    .from(table)
    .select(`${ownerColumn},tai_khoan_id,la_chinh`)
    .in(ownerColumn, ownerIds);
  throwDatabaseError(error);

  const rows = (data ?? []) as (AssignmentRow & Record<string, string>)[];
  const accounts = await loadAccounts(
    supabase,
    uniqueValues(rows.map((row) => row.tai_khoan_id))
  );

  const grouped = new Map<string, AssignmentRow[]>();
  for (const row of rows) {
    const ownerId = row[ownerColumn];
    const list = grouped.get(ownerId) ?? [];
    list.push({ tai_khoan_id: row.tai_khoan_id, la_chinh: row.la_chinh });
    grouped.set(ownerId, list);
  }

  for (const [ownerId, list] of grouped) {
    const members = list
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((row) => accounts.get(row.tai_khoan_id))
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    result.set(ownerId, members);
  }
  return result;
}

async function hydrateWorkTasks(
  supabase: ApiSupabaseClient,
  rows: WorkTaskRow[]
): Promise<WorkTask[]> {
  if (rows.length === 0) return [];

  const [accounts, assignments, { data: progressData, error: progressError }] =
    await Promise.all([
    loadAccounts(supabase, uniqueValues(rows.map((row) => row.nguoi_phu_trach_id))),
    loadAssignments(
      supabase,
      "cong_viec_phu_trach",
      "cong_viec_id",
      rows.map((row) => row.id)
    ),
    supabase
      .from("task")
      .select("cong_viec_id,tien_do_thuc_te")
      .in("cong_viec_id", rows.map((row) => row.id)),
  ]);
  throwDatabaseError(progressError);

  const progressByWorkTask = new Map<string, { total: number; count: number }>();
  for (const item of (progressData ?? []) as WorkTaskProgressRow[]) {
    const current = progressByWorkTask.get(item.cong_viec_id) ?? {
      total: 0,
      count: 0,
    };
    current.total += item.tien_do_thuc_te;
    current.count += 1;
    progressByWorkTask.set(item.cong_viec_id, current);
  }

  return rows.map((row) => {
    const legacy = row.nguoi_phu_trach_id
      ? accounts.get(row.nguoi_phu_trach_id)
      : undefined;
    const assignees = assignments.get(row.id) ?? [];
    const primary = assignees[0] ?? (legacy ? toProjectMember(legacy) : undefined);
    const taskProgress = progressByWorkTask.get(row.id);
    const progress = taskProgress
      ? Math.round(taskProgress.total / taskProgress.count)
      : 0;

    return {
      id: row.id,
      title: row.ten_cv,
      description: row.mo_ta ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      projectId: row.du_an_id,
      assigneeId: primary?.id ?? "",
      assignees: assignees.length > 0 ? assignees : primary ? [primary] : [],
      status: toApiStatus(row.trang_thai),
      priority: toPriority(row.uu_tien),
      startDate: row.ngay_bat_dau ?? "",
      dueDate: row.ngay_hoan_thanh ?? "",
      progress,
      tags: row.nhan_tag ?? [],
      dependsOnTaskId: row.cong_viec_tien_de_id ?? undefined,
    };
  });
}

export async function listWorkTasks(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters = {}
): Promise<WorkTask[]> {
  let query = supabase
    .from("cong_viec")
    .select(WORK_TASK_SELECT)
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_cv", `%${filters.search.trim()}%`);
  }
  if (filters.projectId) query = query.eq("du_an_id", filters.projectId);
  if (filters.assigneeId) {
    const accountId = await resolveAccountId(
      supabase,
      filters.assigneeId,
      "Người phụ trách"
    );
    query = query.eq("nguoi_phu_trach_id", accountId);
  }
  if (filters.priority) query = query.eq("uu_tien", filters.priority);
  if (filters.status) query = query.eq("trang_thai", toDatabaseStatus(filters.status));
  if (filters.overdueOnly) {
    query = query
      .neq("trang_thai", "done")
      .lt("ngay_hoan_thanh", getAppDateKey());
  }

  const { data, error } = await query;
  throwDatabaseError(error);
  return hydrateWorkTasks(supabase, (data ?? []) as WorkTaskRow[]);
}

export async function getWorkTask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<WorkTask | null> {
  const { data, error } = await supabase
    .from("cong_viec")
    .select(WORK_TASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;
  const [task] = await hydrateWorkTasks(supabase, [data as WorkTaskRow]);
  return task;
}

/** Đồng bộ bảng nối người phụ trách; phần tử đầu của `accountIds` là người chính. */
async function syncAssignments(
  supabase: ApiSupabaseClient,
  table: "cong_viec_phu_trach" | "task_phu_trach",
  ownerColumn: "cong_viec_id" | "task_id",
  ownerId: string,
  accountIds: string[]
): Promise<void> {
  const { data: currentData, error: currentError } = await supabase
    .from(table)
    .select("tai_khoan_id")
    .eq(ownerColumn, ownerId);
  throwDatabaseError(currentError);

  const currentIds = (currentData ?? []).map((row) => row.tai_khoan_id as string);
  const removedIds = currentIds.filter((id) => !accountIds.includes(id));
  const newIds = accountIds.filter((id) => !currentIds.includes(id));

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(ownerColumn, ownerId)
      .in("tai_khoan_id", removedIds);
    throwDatabaseError(error);
  }

  if (newIds.length > 0) {
    const { error } = await supabase.from(table).insert(
      newIds.map((accountId) => ({
        [ownerColumn]: ownerId,
        tai_khoan_id: accountId,
        la_chinh: false,
      }))
    );
    throwDatabaseError(error);
  }

  // Chỉ một người được đánh dấu là người phụ trách chính.
  const { error: resetError } = await supabase
    .from(table)
    .update({ la_chinh: false })
    .eq(ownerColumn, ownerId)
    .neq("tai_khoan_id", accountIds[0]);
  throwDatabaseError(resetError);

  const { error: primaryError } = await supabase
    .from(table)
    .update({ la_chinh: true })
    .eq(ownerColumn, ownerId)
    .eq("tai_khoan_id", accountIds[0]);
  throwDatabaseError(primaryError);
}

/** Người phụ trách công việc bắt buộc phải tham gia dự án của công việc đó. */
async function assertProjectParticipants(
  supabase: ApiSupabaseClient,
  projectId: string,
  accountIds: string[]
): Promise<void> {
  const [{ data: managerData, error: managerError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase.from("du_an_quan_ly").select("tai_khoan_id").eq("du_an_id", projectId),
      supabase.from("du_an_thanh_vien").select("tai_khoan_id").eq("du_an_id", projectId),
    ]);
  throwDatabaseError(managerError);
  throwDatabaseError(memberError);

  const allowed = new Set([
    ...(managerData ?? []).map((row) => row.tai_khoan_id as string),
    ...(memberData ?? []).map((row) => row.tai_khoan_id as string),
  ]);
  const invalid = accountIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    throw new ApiException(
      "Chỉ được giao việc cho người tham gia dự án. Hãy thêm họ vào dự án trước.",
      400
    );
  }
}

/** Người phụ trách task bắt buộc nằm trong nhóm phụ trách công việc cha. */
async function assertWorkTaskAssignees(
  supabase: ApiSupabaseClient,
  workTaskId: string,
  accountIds: string[]
): Promise<void> {
  const { data, error } = await supabase
    .from("cong_viec_phu_trach")
    .select("tai_khoan_id")
    .eq("cong_viec_id", workTaskId);
  throwDatabaseError(error);

  const allowed = new Set((data ?? []).map((row) => row.tai_khoan_id as string));
  const invalid = accountIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    throw new ApiException(
      "Chỉ được giao task cho người phụ trách công việc cha. Hãy thêm họ vào công việc trước.",
      400
    );
  }
}

async function workTaskPayload(input: WorkTaskInput, primaryAccountId: string) {
  return {
    ten_cv: input.title,
    mo_ta: input.description ?? null,
    du_an_id: input.projectId,
    nguoi_phu_trach_id: primaryAccountId,
    trang_thai: toDatabaseStatus(input.status),
    uu_tien: input.priority,
    ngay_bat_dau: input.startDate,
    ngay_hoan_thanh: input.dueDate,
    nhan_tag: input.tags,
    cong_viec_tien_de_id: input.dependsOnTaskId ?? null,
  };
}

export async function createWorkTask(
  supabase: ApiSupabaseClient,
  input: WorkTaskInput
): Promise<WorkTask> {
  const assigneeIds = await resolveAccountIds(
    supabase,
    input.assigneeIds,
    "Người phụ trách"
  );
  await assertProjectParticipants(supabase, input.projectId, assigneeIds);

  const payload = await workTaskPayload(input, assigneeIds[0]);
  const { data, error } = await supabase
    .from("cong_viec")
    .insert(payload)
    .select("id")
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về công việc vừa tạo.", 500);

  const taskId = data.id as string;
  await syncAssignments(
    supabase,
    "cong_viec_phu_trach",
    "cong_viec_id",
    taskId,
    assigneeIds
  );

  const task = await getWorkTask(supabase, taskId);
  if (!task) throw new ApiException("Không thể đọc lại công việc vừa tạo.", 500);
  return task;
}

export async function updateWorkTask(
  supabase: ApiSupabaseClient,
  id: string,
  input: WorkTaskInput
): Promise<WorkTask | null> {
  const current = await getWorkTask(supabase, id);
  if (!current) return null;

  const assigneeIds = await resolveAccountIds(
    supabase,
    input.assigneeIds,
    "Người phụ trách"
  );
  await assertProjectParticipants(supabase, input.projectId, assigneeIds);
  // Task con chỉ được giao cho người còn phụ trách công việc này.
  await assertSubtaskAssigneesStillValid(supabase, id, assigneeIds);

  const payload = await workTaskPayload(input, assigneeIds[0]);
  const { data, error } = await supabase
    .from("cong_viec")
    .update(payload)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncAssignments(
    supabase,
    "cong_viec_phu_trach",
    "cong_viec_id",
    id,
    assigneeIds
  );

  return getWorkTask(supabase, id);
}

/**
 * Chặn việc gỡ một người khỏi công việc khi họ vẫn đang phụ trách task con,
 * tránh để dữ liệu task rơi ra ngoài nhóm phụ trách công việc cha.
 */
async function assertSubtaskAssigneesStillValid(
  supabase: ApiSupabaseClient,
  workTaskId: string,
  nextAssigneeIds: string[]
): Promise<void> {
  const { data: subtaskData, error: subtaskError } = await supabase
    .from("task")
    .select("id")
    .eq("cong_viec_id", workTaskId);
  throwDatabaseError(subtaskError);

  const subtaskIds = (subtaskData ?? []).map((row) => row.id as string);
  if (subtaskIds.length === 0) return;

  const { data, error } = await supabase
    .from("task_phu_trach")
    .select("tai_khoan_id")
    .in("task_id", subtaskIds);
  throwDatabaseError(error);

  const stillNeeded = uniqueValues(
    (data ?? []).map((row) => row.tai_khoan_id as string)
  ).filter((accountId) => !nextAssigneeIds.includes(accountId));

  if (stillNeeded.length > 0) {
    const accounts = await loadAccounts(supabase, stillNeeded);
    const names = [...accounts.values()].map((account) => account.ten_nv).join(", ");
    throw new ApiException(
      `Không thể gỡ ${names || "người phụ trách"} khỏi công việc vì họ đang phụ trách task con. Hãy cập nhật task trước.`,
      400
    );
  }
}

export async function deleteWorkTask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("cong_viec")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

export async function listProjectTasks(
  supabase: ApiSupabaseClient,
  projectId: string
): Promise<ProjectTask[]> {
  const tasks = await listWorkTasks(supabase, { projectId });
  const directory = await listDirectory(supabase);
  const members = new Map(directory.map((member) => [member.id, member]));

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: members.get(task.assigneeId) ?? emptyProjectMember(),
    assignees: task.assignees,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    progress: task.progress,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));
}

async function hydrateSubtasks(
  supabase: ApiSupabaseClient,
  rows: SubtaskRow[]
): Promise<Subtask[]> {
  if (rows.length === 0) return [];

  const [accounts, assignments] = await Promise.all([
    loadAccounts(supabase, uniqueValues(rows.map((row) => row.nguoi_phu_trach_id))),
    loadAssignments(
      supabase,
      "task_phu_trach",
      "task_id",
      rows.map((row) => row.id)
    ),
  ]);

  return rows.map((row) => {
    const legacy = row.nguoi_phu_trach_id
      ? accounts.get(row.nguoi_phu_trach_id)
      : undefined;
    const assignees = assignments.get(row.id) ?? [];
    const primary = assignees[0] ?? (legacy ? toProjectMember(legacy) : undefined);

    return {
      id: row.id,
      title: row.ten_task,
      description: row.mo_ta ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workTaskId: row.cong_viec_id,
      assigneeId: primary?.id ?? "",
      assignees: assignees.length > 0 ? assignees : primary ? [primary] : [],
      status: toApiStatus(row.trang_thai),
      priority: toPriority(row.uu_tien),
      startDate: row.ngay_bat_dau ?? "",
      dueDate: row.ngay_ket_thuc ?? "",
      progress: row.tien_do_thuc_te,
      tags: row.nhan_tag ?? [],
    };
  });
}

export async function listSubtasks(
  supabase: ApiSupabaseClient,
  filters: SubtaskFilters = {}
): Promise<Subtask[]> {
  let query = supabase
    .from("task")
    .select(SUBTASK_SELECT)
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_task", `%${filters.search.trim()}%`);
  }
  if (filters.workTaskId) query = query.eq("cong_viec_id", filters.workTaskId);
  if (filters.assigneeId) {
    const accountId = await resolveAccountId(
      supabase,
      filters.assigneeId,
      "Người phụ trách"
    );
    query = query.eq("nguoi_phu_trach_id", accountId);
  }
  if (filters.priority) query = query.eq("uu_tien", filters.priority);
  if (filters.status) query = query.eq("trang_thai", toDatabaseStatus(filters.status));
  if (filters.overdueOnly) {
    query = query
      .neq("trang_thai", "done")
      .lt("ngay_ket_thuc", getAppDateKey());
  }

  const { data, error } = await query;
  throwDatabaseError(error);
  return hydrateSubtasks(supabase, (data ?? []) as SubtaskRow[]);
}

export async function getSubtask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<Subtask | null> {
  const { data, error } = await supabase
    .from("task")
    .select(SUBTASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;
  const [subtask] = await hydrateSubtasks(supabase, [data as SubtaskRow]);
  return subtask;
}

function subtaskPayload(input: SubtaskInput, primaryAccountId: string) {
  return {
    ten_task: input.title,
    mo_ta: input.description ?? null,
    ngay_bat_dau: input.startDate,
    ngay_ket_thuc: input.dueDate,
    nguoi_phu_trach_id: primaryAccountId,
    trang_thai: toDatabaseStatus(input.status),
    uu_tien: input.priority,
    tien_do_thuc_te: input.progress,
    nhan_tag: input.tags,
    cong_viec_id: input.workTaskId,
  };
}

export async function createSubtask(
  supabase: ApiSupabaseClient,
  input: SubtaskInput
): Promise<Subtask> {
  const assigneeIds = await resolveAccountIds(
    supabase,
    input.assigneeIds,
    "Người phụ trách"
  );
  await assertWorkTaskAssignees(supabase, input.workTaskId, assigneeIds);

  const { data, error } = await supabase
    .from("task")
    .insert(subtaskPayload(input, assigneeIds[0]))
    .select("id")
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về task vừa tạo.", 500);

  const subtaskId = data.id as string;
  await syncAssignments(
    supabase,
    "task_phu_trach",
    "task_id",
    subtaskId,
    assigneeIds
  );

  const subtask = await getSubtask(supabase, subtaskId);
  if (!subtask) throw new ApiException("Không thể đọc lại task vừa tạo.", 500);
  return subtask;
}

export async function updateSubtask(
  supabase: ApiSupabaseClient,
  id: string,
  input: SubtaskInput
): Promise<Subtask | null> {
  const assigneeIds = await resolveAccountIds(
    supabase,
    input.assigneeIds,
    "Người phụ trách"
  );
  await assertWorkTaskAssignees(supabase, input.workTaskId, assigneeIds);

  const { data, error } = await supabase
    .from("task")
    .update(subtaskPayload(input, assigneeIds[0]))
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncAssignments(supabase, "task_phu_trach", "task_id", id, assigneeIds);
  return getSubtask(supabase, id);
}

export async function deleteSubtask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

const TASK_REPORT_SELECT =
  "id,cong_viec_id,nguoi_bao_cao_id,noi_dung,tien_do,created_at";
const REPORT_ATTACHMENT_SELECT =
  "id,bao_cao_id,loai,ten_file,duong_dan,kieu_file,kich_thuoc";
const REPORT_LINK_SELECT = "id,bao_cao_id,nhan,duong_dan";

export const TASK_REPORT_BUCKET = "bao-cao";

interface TaskReportRow {
  id: string;
  cong_viec_id: string;
  nguoi_bao_cao_id: string | null;
  noi_dung: string;
  tien_do: number;
  created_at: string;
}

interface ReportAttachmentRow {
  id: string;
  bao_cao_id: string;
  loai: string;
  ten_file: string;
  duong_dan: string;
  kieu_file: string | null;
  kich_thuoc: number | null;
}

interface ReportLinkRow {
  id: string;
  bao_cao_id: string;
  nhan: string | null;
  duong_dan: string;
}

/** Đường dẫn lưu trong DB là storage path; đổi sang URL công khai để hiển thị. */
function attachmentPublicUrl(
  supabase: ApiSupabaseClient,
  path: string
): string {
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(TASK_REPORT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function hydrateTaskReports(
  supabase: ApiSupabaseClient,
  rows: TaskReportRow[]
): Promise<TaskReport[]> {
  if (rows.length === 0) return [];

  const reportIds = rows.map((row) => row.id);
  const [
    { data: attachmentData, error: attachmentError },
    { data: linkData, error: linkError },
    accounts,
  ] = await Promise.all([
    supabase
      .from("bao_cao_dinh_kem")
      .select(REPORT_ATTACHMENT_SELECT)
      .in("bao_cao_id", reportIds)
      .order("created_at"),
    supabase
      .from("bao_cao_lien_ket")
      .select(REPORT_LINK_SELECT)
      .in("bao_cao_id", reportIds)
      .order("created_at"),
    loadAccounts(supabase, uniqueValues(rows.map((row) => row.nguoi_bao_cao_id))),
  ]);
  throwDatabaseError(attachmentError);
  throwDatabaseError(linkError);

  const attachmentsByReport = new Map<string, TaskReportAttachment[]>();
  for (const row of (attachmentData ?? []) as ReportAttachmentRow[]) {
    const list = attachmentsByReport.get(row.bao_cao_id) ?? [];
    list.push({
      id: row.id,
      kind: row.loai === "image" ? "image" : "file",
      fileName: row.ten_file,
      url: attachmentPublicUrl(supabase, row.duong_dan),
      mimeType: row.kieu_file ?? undefined,
      size: row.kich_thuoc ?? undefined,
    });
    attachmentsByReport.set(row.bao_cao_id, list);
  }

  const linksByReport = new Map<string, TaskReportLink[]>();
  for (const row of (linkData ?? []) as ReportLinkRow[]) {
    const list = linksByReport.get(row.bao_cao_id) ?? [];
    list.push({ id: row.id, label: row.nhan ?? undefined, url: row.duong_dan });
    linksByReport.set(row.bao_cao_id, list);
  }

  return rows.map((row) => {
    const account = row.nguoi_bao_cao_id
      ? accounts.get(row.nguoi_bao_cao_id)
      : undefined;
    return {
      id: row.id,
      taskId: row.cong_viec_id,
      authorId: account ? accountReference(account) : "",
      authorName: account?.ten_nv,
      authorColor: account ? avatarColor(account.id) : undefined,
      content: row.noi_dung,
      progress: row.tien_do,
      attachments: attachmentsByReport.get(row.id) ?? [],
      links: linksByReport.get(row.id) ?? [],
      createdAt: row.created_at,
    };
  });
}

export async function listTaskReports(
  supabase: ApiSupabaseClient,
  taskId: string
): Promise<TaskReport[]> {
  const { data, error } = await supabase
    .from("bao_cao_cong_viec")
    .select(TASK_REPORT_SELECT)
    .eq("cong_viec_id", taskId)
    .order("created_at", { ascending: false });
  throwDatabaseError(error);
  return hydrateTaskReports(supabase, (data ?? []) as TaskReportRow[]);
}

export async function getTaskReport(
  supabase: ApiSupabaseClient,
  id: string
): Promise<TaskReport | null> {
  const { data, error } = await supabase
    .from("bao_cao_cong_viec")
    .select(TASK_REPORT_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;
  const [report] = await hydrateTaskReports(supabase, [data as TaskReportRow]);
  return report;
}

/**
 * Tạo báo cáo tiến độ và đồng bộ tiến độ thực tế của công việc.
 * File đã được upload lên storage trước đó; ở đây chỉ lưu metadata.
 */
export async function createTaskReport(
  supabase: ApiSupabaseClient,
  taskId: string,
  input: TaskReportInput
): Promise<TaskReport> {
  const task = await getWorkTask(supabase, taskId);
  if (!task) throw new ApiException("Không tìm thấy công việc.", 404);

  const authorId = input.authorId
    ? await resolveAccountId(supabase, input.authorId, "Người báo cáo")
    : null;

  const { data, error } = await supabase
    .from("bao_cao_cong_viec")
    .insert({
      cong_viec_id: taskId,
      nguoi_bao_cao_id: authorId,
      noi_dung: input.content,
      tien_do: input.progress,
    })
    .select("id")
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về báo cáo vừa tạo.", 500);

  const reportId = data.id as string;

  if (input.attachments.length > 0) {
    const { error: attachmentError } = await supabase
      .from("bao_cao_dinh_kem")
      .insert(
        input.attachments.map((attachment) => ({
          bao_cao_id: reportId,
          loai: attachment.kind,
          ten_file: attachment.fileName,
          duong_dan: attachment.path,
          kieu_file: attachment.mimeType ?? null,
          kich_thuoc: attachment.size ?? null,
        }))
      );
    throwDatabaseError(attachmentError);
  }

  if (input.links.length > 0) {
    const { error: linkError } = await supabase.from("bao_cao_lien_ket").insert(
      input.links.map((link) => ({
        bao_cao_id: reportId,
        nhan: link.label ?? null,
        duong_dan: link.url,
      }))
    );
    throwDatabaseError(linkError);
  }

  // Tiến độ trên slider là nguồn sự thật mới cho công việc.
  if (input.progress !== task.progress) {
    const { error: progressError } = await supabase
      .from("cong_viec")
      .update({ tien_do_thuc_te: input.progress })
      .eq("id", taskId);
    throwDatabaseError(progressError);
  }

  const report = await getTaskReport(supabase, reportId);
  if (!report) throw new ApiException("Không thể đọc lại báo cáo vừa tạo.", 500);
  return report;
}

export async function deleteTaskReport(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data: attachments, error: attachmentError } = await supabase
    .from("bao_cao_dinh_kem")
    .select("duong_dan")
    .eq("bao_cao_id", id);
  throwDatabaseError(attachmentError);

  const { data, error } = await supabase
    .from("bao_cao_cong_viec")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return false;

  const paths = ((attachments ?? []) as { duong_dan: string }[])
    .map((row) => row.duong_dan)
    .filter((path) => !/^https?:\/\//i.test(path));
  if (paths.length > 0) {
    // File mồ côi không chặn việc xóa báo cáo.
    await supabase.storage.from(TASK_REPORT_BUCKET).remove(paths);
  }

  return true;
}

/** Upload ảnh/file của báo cáo lên bucket storage và trả về đường dẫn đã lưu. */
export async function uploadTaskReportFile(
  supabase: ApiSupabaseClient,
  taskId: string,
  file: File
): Promise<string> {
  const extension = file.name.includes(".")
    ? `.${file.name.split(".").pop()?.toLowerCase()}`
    : "";
  const path = `${taskId}/${Date.now()}-${crypto.randomUUID()}${extension}`;

  const { error } = await supabase.storage
    .from(TASK_REPORT_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new ApiException(
      `Không thể tải file “${file.name}” lên kho lưu trữ. ${error.message}`,
      500
    );
  }

  return path;
}

const SUBTASK_REPORT_SELECT =
  "id,task_id,nguoi_bao_cao_id,noi_dung,tien_do,created_at";

interface SubtaskReportRow {
  id: string;
  task_id: string;
  nguoi_bao_cao_id: string | null;
  noi_dung: string;
  tien_do: number;
  created_at: string;
}

async function hydrateSubtaskReports(
  supabase: ApiSupabaseClient,
  rows: SubtaskReportRow[]
): Promise<SubtaskReport[]> {
  if (rows.length === 0) return [];

  const reportIds = rows.map((row) => row.id);
  const [
    { data: attachmentData, error: attachmentError },
    { data: linkData, error: linkError },
    accounts,
  ] = await Promise.all([
    supabase
      .from("bao_cao_task_dinh_kem")
      .select(REPORT_ATTACHMENT_SELECT)
      .in("bao_cao_id", reportIds)
      .order("created_at"),
    supabase
      .from("bao_cao_task_lien_ket")
      .select(REPORT_LINK_SELECT)
      .in("bao_cao_id", reportIds)
      .order("created_at"),
    loadAccounts(supabase, uniqueValues(rows.map((row) => row.nguoi_bao_cao_id))),
  ]);
  throwDatabaseError(attachmentError);
  throwDatabaseError(linkError);

  const attachmentsByReport = new Map<string, TaskReportAttachment[]>();
  for (const row of (attachmentData ?? []) as ReportAttachmentRow[]) {
    const list = attachmentsByReport.get(row.bao_cao_id) ?? [];
    list.push({
      id: row.id,
      kind: row.loai === "image" ? "image" : "file",
      fileName: row.ten_file,
      url: attachmentPublicUrl(supabase, row.duong_dan),
      mimeType: row.kieu_file ?? undefined,
      size: row.kich_thuoc ?? undefined,
    });
    attachmentsByReport.set(row.bao_cao_id, list);
  }

  const linksByReport = new Map<string, TaskReportLink[]>();
  for (const row of (linkData ?? []) as ReportLinkRow[]) {
    const list = linksByReport.get(row.bao_cao_id) ?? [];
    list.push({ id: row.id, label: row.nhan ?? undefined, url: row.duong_dan });
    linksByReport.set(row.bao_cao_id, list);
  }

  return rows.map((row) => {
    const account = row.nguoi_bao_cao_id
      ? accounts.get(row.nguoi_bao_cao_id)
      : undefined;
    return {
      id: row.id,
      subtaskId: row.task_id,
      authorId: account ? accountReference(account) : "",
      authorName: account?.ten_nv,
      authorColor: account ? avatarColor(account.id) : undefined,
      content: row.noi_dung,
      progress: row.tien_do,
      attachments: attachmentsByReport.get(row.id) ?? [],
      links: linksByReport.get(row.id) ?? [],
      createdAt: row.created_at,
    };
  });
}

export async function listSubtaskReports(
  supabase: ApiSupabaseClient,
  subtaskId: string
): Promise<SubtaskReport[]> {
  const { data, error } = await supabase
    .from("bao_cao_task")
    .select(SUBTASK_REPORT_SELECT)
    .eq("task_id", subtaskId)
    .order("created_at", { ascending: false });
  throwDatabaseError(error);
  return hydrateSubtaskReports(supabase, (data ?? []) as SubtaskReportRow[]);
}

async function getSubtaskReport(
  supabase: ApiSupabaseClient,
  id: string
): Promise<SubtaskReport | null> {
  const { data, error } = await supabase
    .from("bao_cao_task")
    .select(SUBTASK_REPORT_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;
  const [report] = await hydrateSubtaskReports(supabase, [data as SubtaskReportRow]);
  return report;
}

export async function createSubtaskReport(
  supabase: ApiSupabaseClient,
  subtaskId: string,
  input: TaskReportInput
): Promise<SubtaskReport> {
  const subtask = await getSubtask(supabase, subtaskId);
  if (!subtask) throw new ApiException("Không tìm thấy task.", 404);

  const authorId = input.authorId
    ? await resolveAccountId(supabase, input.authorId, "Người báo cáo")
    : null;
  const { data, error } = await supabase
    .from("bao_cao_task")
    .insert({
      task_id: subtaskId,
      nguoi_bao_cao_id: authorId,
      noi_dung: input.content,
      tien_do: input.progress,
    })
    .select("id")
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về báo cáo vừa tạo.", 500);

  const reportId = data.id as string;
  if (input.attachments.length > 0) {
    const { error: attachmentError } = await supabase
      .from("bao_cao_task_dinh_kem")
      .insert(
        input.attachments.map((attachment) => ({
          bao_cao_id: reportId,
          loai: attachment.kind,
          ten_file: attachment.fileName,
          duong_dan: attachment.path,
          kieu_file: attachment.mimeType ?? null,
          kich_thuoc: attachment.size ?? null,
        }))
      );
    throwDatabaseError(attachmentError);
  }

  if (input.links.length > 0) {
    const { error: linkError } = await supabase
      .from("bao_cao_task_lien_ket")
      .insert(
        input.links.map((link) => ({
          bao_cao_id: reportId,
          nhan: link.label ?? null,
          duong_dan: link.url,
        }))
      );
    throwDatabaseError(linkError);
  }

  if (input.progress !== subtask.progress) {
    const { error: progressError } = await supabase
      .from("task")
      .update({ tien_do_thuc_te: input.progress })
      .eq("id", subtaskId);
    throwDatabaseError(progressError);
  }

  const report = await getSubtaskReport(supabase, reportId);
  if (!report) throw new ApiException("Không thể đọc lại báo cáo vừa tạo.", 500);
  return report;
}
