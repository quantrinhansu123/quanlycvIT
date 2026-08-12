import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import { resolveAuthUserId } from "@/lib/supabase/authorization";
import {
  DEFAULT_PROJECT_STEPS,
  type Project,
  type ProjectColor,
  type ProjectDirectoryItem,
  type ProjectInput,
  type ProjectMember,
  type ProjectStepConfig,
} from "@/types/project";
import type {
  Subtask,
  SubtaskInput,
  SubtaskReport,
  SubtaskTestHistoryEntry,
  SubtaskTestResult,
  SubtaskUpdateEntry,
  TaskFileAttachment,
  TaskLinkAttachment,
} from "@/types/subtask";
import type { TaskActivityEvent, TaskActivityType } from "@/types/activity";
import type {
  TaskPriority,
  TaskReport,
  TaskReportAttachment,
  TaskReportLink,
  TaskStatus,
  WorkTask,
  WorkTaskDirectoryItem,
  WorkTaskInput,
} from "@/types/task";
import { deriveWorkTaskStatus } from "@/types/task";
import type { ProjectTask } from "@/services/mock-data";
import { getAppDateKey } from "@/lib/utils";
import { measureApiTiming } from "@/lib/api/observability";

interface AccountRow {
  id: string;
  ma_nv: string;
  ten_nv: string;
  chuc_vu: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface ProjectMemberEmbedRow {
  tai_khoan_id: string;
  tai_khoan: AccountRow | null;
}

interface ProjectManagerEmbedRow {
  tai_khoan_id: string;
  la_chinh: boolean;
  tai_khoan: AccountRow | null;
}

interface ProjectTaskStatsRow {
  id: string;
  trang_thai: string;
  ngay_hoan_thanh: string | null;
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
  hinh_anh: string[] | null;
  tep_dinh_kem: TaskFileAttachment[] | null;
  lien_ket_dinh_kem: TaskLinkAttachment[] | null;
  /** Người quản lý chính "cũ" (cột nguoi_ql_id), lấy kèm qua embed. */
  legacy_manager: AccountRow | null;
  /** Danh sách người quản lý đầy đủ, lấy kèm qua embed thay vì round-trip riêng. */
  du_an_quan_ly: ProjectManagerEmbedRow[];
  /** Danh sách thành viên, lấy kèm qua embed thay vì round-trip riêng. */
  du_an_thanh_vien: ProjectMemberEmbedRow[];
  /** Thống kê công việc của dự án, lấy kèm qua embed thay vì round-trip riêng. */
  cong_viec: ProjectTaskStatsRow[];
}

interface AssignmentEmbedRow {
  tai_khoan_id: string;
  la_chinh: boolean;
  xac_nhan_luc?: string | null;
  tai_khoan: AccountRow | null;
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
  hinh_anh: string[] | null;
  tep_dinh_kem: TaskFileAttachment[] | null;
  lien_ket_dinh_kem: TaskLinkAttachment[] | null;
  /** Người phụ trách chính "cũ" (cột nguoi_phu_trach_id), lấy kèm qua embed. */
  legacy_assignee: AccountRow | null;
  /** Danh sách người phụ trách đầy đủ, lấy kèm qua embed thay vì round-trip riêng. */
  cong_viec_phu_trach: AssignmentEmbedRow[];
  /** Trạng thái/tiến độ Task con, lấy kèm để tính trạng thái và tiến độ Công việc. */
  task: { tien_do_thuc_te: number; trang_thai: string }[];
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
  nguoi_test_id: string | null;
  ghi_chu_test: string | null;
  trang_thai: string;
  uu_tien: string;
  tien_do_thuc_te: number;
  nhan_tag: string[] | null;
  hinh_anh: string[] | null;
  tep_dinh_kem: TaskFileAttachment[] | null;
  lien_ket_dinh_kem: TaskLinkAttachment[] | null;
  cap_nhat_bo_sung: SubtaskUpdateEntry[] | null;
  task_tien_de_id: string | null;
  cong_viec_id: string;
  nguoi_tao_id: string | null;
  /** Người phụ trách chính "cũ" (cột nguoi_phu_trach_id), lấy kèm qua embed. */
  legacy_assignee: AccountRow | null;
  /** Danh sách người phụ trách đầy đủ, lấy kèm qua embed thay vì round-trip riêng. */
  task_phu_trach: AssignmentEmbedRow[];
  /** Người tạo Task, lấy kèm để hiển thị trong danh sách. */
  creator: AccountRow | null;
  tester: AccountRow | null;
}

interface TaskActivityRow {
  id: string;
  task_id: string;
  loai: TaskActivityType;
  tieu_de: string;
  chi_tiet: Record<string, unknown> | null;
  created_at: string;
  tac_gia: AccountRow | null;
}

interface SubtaskTestHistoryRow {
  id: string;
  task_id: string;
  ket_qua: "passed" | "failed";
  ghi_chu: string | null;
  created_at: string;
  tester: AccountRow | null;
}

export interface WorkTaskFilters {
  search?: string;
  projectId?: string;
  assigneeId?: string;
  /** Lọc theo nhiều người phụ trách cùng lúc; `assigneeId` (số ít) vẫn được giữ để tương thích. */
  assigneeIds?: string[];
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
  testerId?: string;
}

export interface SubtaskFilters {
  search?: string;
  workTaskId?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  priority?: TaskPriority;
  /** Lọc đồng thời nhiều mức ưu tiên; `priority` được giữ cho các nơi gọi cũ. */
  priorities?: TaskPriority[];
  status?: TaskStatus;
  /** Lọc đồng thời nhiều trạng thái; `status` được giữ cho các nơi gọi cũ. */
  statuses?: TaskStatus[];
  overdueOnly?: boolean;
  /** UUID tài khoản tester; chỉ API nội bộ gán sau khi xác thực request. */
  testerId?: string;
}

/** Bộ lọc cho trang danh sách task: thêm lọc theo dự án và nhiều người thực hiện, có phân trang. */
export interface SubtaskListFilters extends SubtaskFilters {
  projectId?: string;
  /** Lọc theo nhiều công việc cùng lúc; `workTaskId` (số ít) vẫn được giữ để tương thích. */
  workTaskIds?: string[];
  assigneeIds?: string[];
  page: number;
  pageSize: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
}

function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

const ACCOUNT_SELECT = "id,ma_nv,ten_nv,chuc_vu,email,avatar_url";
const PROJECT_SELECT =
  "id,ma_da,ten_da,hop_mau,mo_ta,ngay_bd,ngay_kt,nguoi_ql_id,steps,hinh_anh,tep_dinh_kem,lien_ket_dinh_kem," +
  `legacy_manager:tai_khoan!nguoi_ql_id(${ACCOUNT_SELECT}),` +
  `du_an_quan_ly(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  `du_an_thanh_vien(tai_khoan_id,tai_khoan(${ACCOUNT_SELECT})),` +
  "cong_viec(id,trang_thai,ngay_hoan_thanh)";
const PROJECT_DIRECTORY_SELECT =
  "id,ma_da,ten_da,hop_mau,ngay_bd,ngay_kt,nguoi_ql_id," +
  `legacy_manager:tai_khoan!nguoi_ql_id(${ACCOUNT_SELECT}),` +
  `du_an_quan_ly(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  `du_an_thanh_vien(tai_khoan_id,tai_khoan(${ACCOUNT_SELECT}))`;
const WORK_TASK_SELECT =
  "id,ten_cv,mo_ta,created_at,updated_at,du_an_id,nguoi_phu_trach_id,trang_thai,uu_tien,ngay_bat_dau,ngay_hoan_thanh,tien_do_thuc_te,nhan_tag,cong_viec_tien_de_id,hinh_anh,tep_dinh_kem,lien_ket_dinh_kem," +
  `legacy_assignee:tai_khoan!nguoi_phu_trach_id(${ACCOUNT_SELECT}),` +
  `cong_viec_phu_trach(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  "task(tien_do_thuc_te,trang_thai)";
const WORK_TASK_DIRECTORY_SELECT =
  "id,ten_cv,du_an_id,ngay_bat_dau,ngay_hoan_thanh,nguoi_phu_trach_id," +
  `legacy_assignee:tai_khoan!nguoi_phu_trach_id(${ACCOUNT_SELECT}),` +
  `cong_viec_phu_trach(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT}))`;
const SUBTASK_SELECT =
  "id,ten_task,mo_ta,created_at,updated_at,ngay_bat_dau,ngay_ket_thuc,nguoi_phu_trach_id,nguoi_tao_id,nguoi_test_id,ghi_chu_test,trang_thai,uu_tien,tien_do_thuc_te,nhan_tag,hinh_anh,tep_dinh_kem,lien_ket_dinh_kem,cap_nhat_bo_sung,task_tien_de_id,cong_viec_id," +
  `legacy_assignee:tai_khoan!nguoi_phu_trach_id(${ACCOUNT_SELECT}),` +
  `creator:tai_khoan!nguoi_tao_id(${ACCOUNT_SELECT}),` +
  `tester:tai_khoan!nguoi_test_id(${ACCOUNT_SELECT}),` +
  `task_phu_trach(tai_khoan_id,la_chinh,xac_nhan_luc,tai_khoan(${ACCOUNT_SELECT}))`;
const TASK_ACTIVITY_SELECT =
  "id,task_id,loai,tieu_de,chi_tiet,created_at," + `tac_gia:tai_khoan(${ACCOUNT_SELECT})`;
const SUBTASK_TEST_HISTORY_SELECT =
  "id,task_id,ket_qua,ghi_chu,created_at," + `tester:tai_khoan!nguoi_test_id(${ACCOUNT_SELECT})`;
/** Trang mặc định cho timeline hoạt động — panel nhỏ, không cần tải nhiều mỗi lần. */
const TASK_ACTIVITY_PAGE_SIZE = 20;

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

/** Trạng thái mặc định khi nhân viên gửi báo cáo tiến độ. */
function deriveSubtaskStatus(progress: number): TaskStatus {
  if (progress >= 100) return "testing";
  if (progress > 0) return "inProgress";
  return "todo";
}

/**
 * Đồng bộ tiến độ khi quản trị viên đổi trạng thái trực tiếp:
 * - Cần làm: chưa bắt đầu (0%).
 * - Đang làm: giữ tiến độ hợp lệ hiện tại; nếu đang ở biên 0/100 thì bắt đầu ở 1%.
 * - Chờ duyệt/Đã hoàn thành: công việc đã đạt 100%.
 */
function progressForSubtaskStatus(status: TaskStatus, currentProgress: number): number {
  if (status === "todo") return 0;
  if (status === "testing" || status === "review" || status === "done") return 100;
  return currentProgress > 0 && currentProgress < 100 ? currentProgress : 1;
}

function normalizeSubtaskStatus(status: string, progress: number): TaskStatus {
  const normalized = toApiStatus(status);
  if (
    normalized === "todo" ||
    normalized === "inProgress" ||
    normalized === "testing" ||
    normalized === "review" ||
    normalized === "done"
  ) {
    return normalized;
  }
  return deriveSubtaskStatus(progress);
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

function toPostgrestInValues(values: string[]): string {
  return values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
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

interface ResolvedAccounts {
  ids: string[];
  accountsById: Map<string, AccountRow>;
}

async function resolveAccounts(
  supabase: ApiSupabaseClient,
  references: string[],
  label: string
): Promise<ResolvedAccounts> {
  const uniqueReferences = [...new Set(references)];
  if (uniqueReferences.length === 0) return { ids: [], accountsById: new Map() };

  const uuidReferences = uniqueReferences.filter(isUuid);
  const employeeCodes = uniqueReferences.filter((reference) => !isUuid(reference));

  let query = supabase.from("tai_khoan").select(ACCOUNT_SELECT);
  if (uuidReferences.length === 0) {
    query = query.in("ma_nv", employeeCodes);
  } else if (employeeCodes.length === 0) {
    query = query.in("id", uuidReferences);
  } else {
    query = query.or(
      `id.in.(${toPostgrestInValues(uuidReferences)}),ma_nv.in.(${toPostgrestInValues(employeeCodes)})`
    );
  }

  const { data, error } = await query;
  throwDatabaseError(error);

  const accounts = (data ?? []) as AccountRow[];
  const accountIdsById = new Map(accounts.map((account) => [account.id, account.id]));
  const accountIdsByEmployeeCode = new Map(
    accounts.map((account) => [account.ma_nv, account.id])
  );

  const ids = uniqueReferences.map((reference) => {
    const accountId = isUuid(reference)
      ? accountIdsById.get(reference)
      : accountIdsByEmployeeCode.get(reference);
    if (!accountId) {
      throw new ApiException(`${label} không tồn tại trong bảng tài khoản.`, 400);
    }
    return accountId;
  });
  return { ids, accountsById: new Map(accounts.map((account) => [account.id, account])) };
}

async function resolveAccountIds(
  supabase: ApiSupabaseClient,
  references: string[],
  label: string
): Promise<string[]> {
  return (await resolveAccounts(supabase, references, label)).ids;
}

/**
 * Không còn cần round-trip riêng cho quản lý/thành viên/thống kê công việc:
 * `PROJECT_SELECT` đã lấy kèm (embed) `du_an_quan_ly`, `du_an_thanh_vien`,
 * `cong_viec` và `legacy_manager` trong cùng một truy vấn.
 */
function hydrateProjects(rows: ProjectRow[]): Project[] {
  const today = getAppDateKey();

  return rows.map((row) => {
    const managerAssignments = row.du_an_quan_ly ?? [];
    const projectTasks = row.cong_viec ?? [];
    const managers = managerAssignments
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    // Dữ liệu cũ chưa có bản ghi liên kết vẫn đọc được từ nguoi_ql_id.
    if (managers.length === 0 && row.legacy_manager) {
      managers.push(toProjectMember(row.legacy_manager));
    }
    const managerAccountIds = new Set(managerAssignments.map((assignment) => assignment.tai_khoan_id));
    if (row.nguoi_ql_id) managerAccountIds.add(row.nguoi_ql_id);
    const members = (row.du_an_thanh_vien ?? [])
      .filter((membership) => !managerAccountIds.has(membership.tai_khoan_id))
      .map((membership) => membership.tai_khoan)
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
      files: row.tep_dinh_kem ?? [],
      links: row.lien_ket_dinh_kem ?? [],
      images: row.hinh_anh ?? [],
    };
  });
}

async function syncProjectMembers(
  supabase: ApiSupabaseClient,
  projectId: string,
  memberIds: string[]
): Promise<void> {
  if (memberIds.length > 0) {
    const { error: upsertError } = await supabase.from("du_an_thanh_vien").upsert(
      memberIds.map((accountId) => ({
        du_an_id: projectId,
        tai_khoan_id: accountId,
      })),
      { onConflict: "du_an_id,tai_khoan_id" }
    );
    throwDatabaseError(upsertError);
  }

  let deleteQuery = supabase.from("du_an_thanh_vien").delete().eq("du_an_id", projectId);
  if (memberIds.length > 0) {
    deleteQuery = deleteQuery.not("tai_khoan_id", "in", `(${toPostgrestInValues(memberIds)})`);
  }
  const { error: deleteError } = await deleteQuery;
  throwDatabaseError(deleteError);
}

async function syncProjectManagers(
  supabase: ApiSupabaseClient,
  projectId: string,
  managerIds: string[]
): Promise<void> {
  if (managerIds.length > 0) {
    const { error: upsertError } = await supabase.from("du_an_quan_ly").upsert(
      managerIds.map((accountId) => ({
        du_an_id: projectId,
        tai_khoan_id: accountId,
        la_chinh: accountId === managerIds[0],
      })),
      { onConflict: "du_an_id,tai_khoan_id" }
    );
    throwDatabaseError(upsertError);
  }

  let deleteQuery = supabase.from("du_an_quan_ly").delete().eq("du_an_id", projectId);
  if (managerIds.length > 0) {
    deleteQuery = deleteQuery.not("tai_khoan_id", "in", `(${toPostgrestInValues(managerIds)})`);
  }
  const { error: deleteError } = await deleteQuery;
  throwDatabaseError(deleteError);
}

function withProjectPeople(
  row: ProjectRow,
  managerIds: string[],
  memberIds: string[],
  accountsById: Map<string, AccountRow>
): ProjectRow {
  return {
    ...row,
    legacy_manager: accountsById.get(managerIds[0]) ?? row.legacy_manager,
    du_an_quan_ly: managerIds.map((accountId) => ({
      tai_khoan_id: accountId,
      la_chinh: accountId === managerIds[0],
      tai_khoan: accountsById.get(accountId) ?? null,
    })),
    du_an_thanh_vien: memberIds.map((accountId) => ({
      tai_khoan_id: accountId,
      tai_khoan: accountsById.get(accountId) ?? null,
    })),
  };
}

/** Đồng bộ quản lý và thành viên song song, nhưng luôn đợi cả hai hoàn tất trước khi trả lỗi. */
async function syncProjectPeople(
  supabase: ApiSupabaseClient,
  projectId: string,
  managerIds: string[],
  memberIds: string[]
): Promise<void> {
  const results = await Promise.all([
    syncProjectManagers(supabase, projectId, managerIds).then(
      () => undefined,
      (error: unknown) => error
    ),
    syncProjectMembers(supabase, projectId, memberIds).then(
      () => undefined,
      (error: unknown) => error
    ),
  ]);
  const failure = results.find((result) => result !== undefined);
  if (failure !== undefined) throw failure;
}

/** Danh sách dự án mà một tài khoản là thành viên hoặc người quản lý. */
async function listProjectIdsForParticipant(
  supabase: ApiSupabaseClient,
  accountId: string
): Promise<string[]> {
  const [memberResult, managerResult, legacyResult] = await Promise.all([
    supabase.from("du_an_thanh_vien").select("du_an_id").eq("tai_khoan_id", accountId),
    supabase.from("du_an_quan_ly").select("du_an_id").eq("tai_khoan_id", accountId),
    supabase.from("du_an").select("id").eq("nguoi_ql_id", accountId),
  ]);
  throwDatabaseError(memberResult.error);
  throwDatabaseError(managerResult.error);
  throwDatabaseError(legacyResult.error);
  return uniqueValues([
    ...(memberResult.data ?? []).map((row) => row.du_an_id as string),
    ...(managerResult.data ?? []).map((row) => row.du_an_id as string),
    ...(legacyResult.data ?? []).map((row) => row.id as string),
  ]);
}

export async function listProjects(
  supabase: ApiSupabaseClient,
  search?: string,
  participantAccountId?: string
): Promise<Project[]> {
  const visibleProjectIds = participantAccountId
    ? await listProjectIdsForParticipant(supabase, participantAccountId)
    : undefined;
  if (visibleProjectIds?.length === 0) return [];

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
  if (visibleProjectIds) query = query.in("id", visibleProjectIds);

  const { data, error } = await query;
  throwDatabaseError(error);
  return hydrateProjects((data ?? []) as unknown as ProjectRow[]);
}

/** Danh sách dự án tối giản cho dropdown/form, không tải mô tả, tệp hay thống kê. */
export async function listProjectDirectory(
  supabase: ApiSupabaseClient,
  participantAccountId?: string
): Promise<ProjectDirectoryItem[]> {
  const visibleProjectIds = participantAccountId
    ? await listProjectIdsForParticipant(supabase, participantAccountId)
    : undefined;
  if (visibleProjectIds?.length === 0) return [];

  let query = supabase
    .from("du_an")
    .select(PROJECT_DIRECTORY_SELECT)
    .order("ten_da");
  if (visibleProjectIds) query = query.in("id", visibleProjectIds);
  const { data, error } = await query;
  throwDatabaseError(error);

  return (data ?? []).map((raw) => {
    const row = raw as unknown as Pick<ProjectRow,
      "id" | "ma_da" | "ten_da" | "hop_mau" | "ngay_bd" | "ngay_kt" | "nguoi_ql_id" |
      "legacy_manager" | "du_an_quan_ly" | "du_an_thanh_vien">;
    const managerAssignments = row.du_an_quan_ly ?? [];
    const managers = managerAssignments
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    if (managers.length === 0 && row.legacy_manager) managers.push(toProjectMember(row.legacy_manager));
    const managerIds = new Set(managerAssignments.map((assignment) => assignment.tai_khoan_id));
    if (row.nguoi_ql_id) managerIds.add(row.nguoi_ql_id);
    const members = (row.du_an_thanh_vien ?? [])
      .filter((membership) => !managerIds.has(membership.tai_khoan_id))
      .map((membership) => membership.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    return {
      id: row.id,
      code: row.ma_da,
      name: row.ten_da,
      color: projectColor(row.hop_mau),
      startDate: row.ngay_bd ?? "",
      endDate: row.ngay_kt ?? "",
      managers,
      members,
    };
  });
}

/** Giống `listProjects` nhưng chỉ tải một trang kết quả. */
export async function listProjectsPage(
  supabase: ApiSupabaseClient,
  filters: { search?: string; managerIds?: string[]; participantAccountId?: string; page: number; pageSize: number }
): Promise<PagedResult<Project>> {
  let projectIdsFromManagers: string[] | undefined;
  if (filters.managerIds && filters.managerIds.length > 0) {
    // `managerIds` có thể là mã nhân viên (ma_nv) từ UI, cần quy về id UUID
    // thật của tài khoản trước khi so khớp với du_an_quan_ly.tai_khoan_id.
    const accountIds = await resolveAccountIds(supabase, filters.managerIds, "Người quản lý");
    const { data, error } = await supabase
      .from("du_an_quan_ly")
      .select("du_an_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    projectIdsFromManagers = uniqueValues((data ?? []).map((row) => row.du_an_id as string));
    if (projectIdsFromManagers.length === 0) return { items: [], total: 0 };
  }

  if (filters.participantAccountId) {
    const participantProjectIds = await listProjectIdsForParticipant(supabase, filters.participantAccountId);
    projectIdsFromManagers = projectIdsFromManagers
      ? projectIdsFromManagers.filter((id) => participantProjectIds.includes(id))
      : participantProjectIds;
    if (projectIdsFromManagers.length === 0) return { items: [], total: 0 };
  }

  let query = supabase
    .from("du_an")
    .select(PROJECT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  const term = filters.search?.trim();
  if (term) {
    const safeTerm = term.replace(/[,().%_]/g, " ").trim();
    if (safeTerm) {
      query = query.or(`ten_da.ilike.%${safeTerm}%,ma_da.ilike.%${safeTerm}%`);
    }
  }
  if (projectIdsFromManagers) query = query.in("id", projectIdsFromManagers);

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const { data, error, count } = await query.range(from, to);
  throwDatabaseError(error);
  const items = hydrateProjects((data ?? []) as unknown as ProjectRow[]);
  return { items, total: count ?? 0 };
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
  const [project] = hydrateProjects([data as unknown as ProjectRow]);
  return project;
}

export async function createProject(
  supabase: ApiSupabaseClient,
  input: ProjectInput
): Promise<Project> {
  const [resolvedManagers, resolvedMembers] = await Promise.all([
    resolveAccounts(supabase, input.managerIds, "Người quản lý"),
    resolveAccounts(supabase, input.memberIds, "Thành viên dự án"),
  ]);
  const managerIds = resolvedManagers.ids;
  const resolvedMemberIds = resolvedMembers.ids;
  const memberIds = resolvedMemberIds.filter((id) => !managerIds.includes(id));
  const accountsById = new Map([
    ...resolvedManagers.accountsById,
    ...resolvedMembers.accountsById,
  ]);

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
      hinh_anh: input.images,
      tep_dinh_kem: input.files,
      lien_ket_dinh_kem: input.links,
    })
    .select(PROJECT_SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về dự án vừa tạo.", 500);
  const projectRow = data as unknown as ProjectRow;

  try {
    await syncProjectPeople(supabase, projectRow.id, managerIds, memberIds);
  } catch (syncError) {
    await supabase.from("du_an").delete().eq("id", projectRow.id);
    throw syncError;
  }

  const [project] = hydrateProjects([
    withProjectPeople(
      projectRow,
      managerIds,
      memberIds,
      accountsById
    ),
  ]);
  return project;
}

export async function updateProject(
  supabase: ApiSupabaseClient,
  id: string,
  input: ProjectInput
): Promise<Project | null> {
  const [resolvedManagers, resolvedMembers] = await Promise.all([
    resolveAccounts(supabase, input.managerIds, "Người quản lý"),
    resolveAccounts(supabase, input.memberIds, "Thành viên dự án"),
  ]);
  const managerIds = resolvedManagers.ids;
  const resolvedMemberIds = resolvedMembers.ids;
  const memberIds = resolvedMemberIds.filter((id) => !managerIds.includes(id));
  const accountsById = new Map([
    ...resolvedManagers.accountsById,
    ...resolvedMembers.accountsById,
  ]);

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
      hinh_anh: input.images,
      tep_dinh_kem: input.files,
      lien_ket_dinh_kem: input.links,
    })
    .eq("id", id)
    .select(PROJECT_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncProjectPeople(supabase, id, managerIds, memberIds);
  const [project] = hydrateProjects([
    withProjectPeople(
      data as unknown as ProjectRow,
      managerIds,
      memberIds,
      accountsById
    ),
  ]);
  return project;
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

/**
 * Không còn cần round-trip riêng cho người phụ trách/tiến độ: `WORK_TASK_SELECT`
 * đã lấy kèm (embed) `cong_viec_phu_trach`, `legacy_assignee` và `task` trong
 * cùng một truy vấn, nên hàm này chỉ còn việc dựng lại hình dạng dữ liệu.
 */
function hydrateWorkTasks(rows: WorkTaskRow[]): WorkTask[] {
  return rows.map((row) => {
    const assignees = (row.cong_viec_phu_trach ?? [])
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    const primary =
      assignees[0] ?? (row.legacy_assignee ? toProjectMember(row.legacy_assignee) : undefined);
    const progressRows = row.task ?? [];
    const progress =
      progressRows.length > 0
        ? Math.round(
            progressRows.reduce((sum, item) => sum + item.tien_do_thuc_te, 0) /
              progressRows.length
          )
        : 0;
    const status = deriveWorkTaskStatus(
      progressRows.map((item) => ({
        progress: item.tien_do_thuc_te,
        status: toApiStatus(item.trang_thai),
      }))
    );

    return {
      id: row.id,
      title: row.ten_cv,
      description: row.mo_ta ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      projectId: row.du_an_id,
      assigneeId: primary?.id ?? "",
      assignees: assignees.length > 0 ? assignees : primary ? [primary] : [],
      status,
      priority: toPriority(row.uu_tien),
      startDate: row.ngay_bat_dau ?? "",
      dueDate: row.ngay_hoan_thanh ?? "",
      progress,
      tags: row.nhan_tag ?? [],
      dependsOnTaskId: row.cong_viec_tien_de_id ?? undefined,
      files: row.tep_dinh_kem ?? [],
      links: row.lien_ket_dinh_kem ?? [],
      images: row.hinh_anh ?? [],
    };
  });
}

export async function listWorkTasks(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters = {}
): Promise<WorkTask[]> {
  let taskIdsFromAssignees: string[] | undefined;
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    const accountIds = await resolveAccountIds(supabase, filters.assigneeIds, "Người phụ trách");
    const { data, error } = await supabase
      .from("cong_viec_phu_trach")
      .select("cong_viec_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    taskIdsFromAssignees = uniqueValues((data ?? []).map((row) => row.cong_viec_id as string));
    if (taskIdsFromAssignees.length === 0) return [];
  }

  let query = supabase
    .from("cong_viec")
    .select(WORK_TASK_SELECT)
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_cv", `%${filters.search.trim()}%`);
  }
  if (filters.projectId) query = query.eq("du_an_id", filters.projectId);
  if (taskIdsFromAssignees) query = query.in("id", taskIdsFromAssignees);
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
  return hydrateWorkTasks((data ?? []) as unknown as WorkTaskRow[]);
}

/** Danh sách công việc tối giản cho dropdown và quan hệ tiền đề. */
export async function listWorkTaskDirectory(
  supabase: ApiSupabaseClient,
  assigneeIds?: string[]
): Promise<WorkTaskDirectoryItem[]> {
  let visibleTaskIds: string[] | undefined;
  if (assigneeIds && assigneeIds.length > 0) {
    const accountIds = await resolveAccountIds(supabase, assigneeIds, "Người phụ trách");
    const { data, error } = await supabase
      .from("cong_viec_phu_trach")
      .select("cong_viec_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    visibleTaskIds = uniqueValues((data ?? []).map((row) => row.cong_viec_id as string));
    if (visibleTaskIds.length === 0) return [];
  }

  let query = supabase
    .from("cong_viec")
    .select(WORK_TASK_DIRECTORY_SELECT)
    .order("ten_cv");
  if (visibleTaskIds) query = query.in("id", visibleTaskIds);
  const { data, error } = await query;
  throwDatabaseError(error);
  return (data ?? []).map((raw) => {
    const row = raw as unknown as Pick<WorkTaskRow,
      "id" | "ten_cv" | "du_an_id" | "ngay_bat_dau" | "ngay_hoan_thanh" |
      "legacy_assignee" | "cong_viec_phu_trach">;
    const assignees = (row.cong_viec_phu_trach ?? [])
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    if (assignees.length === 0 && row.legacy_assignee) assignees.push(toProjectMember(row.legacy_assignee));
    return {
      id: row.id,
      title: row.ten_cv,
      projectId: row.du_an_id,
      startDate: row.ngay_bat_dau ?? "",
      dueDate: row.ngay_hoan_thanh ?? "",
      assignees,
    };
  });
}

/**
 * Giống `listWorkTasks` nhưng chỉ tải một trang kết quả (dùng cho trang danh sách
 * dạng bảng có phân trang) thay vì hydrate toàn bộ tập kết quả khớp bộ lọc.
 */
export async function listWorkTasksPage(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters & { page: number; pageSize: number }
): Promise<PagedResult<WorkTask>> {
  let taskIdsFromAssignees: string[] | undefined;
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    // `assigneeIds` có thể là mã nhân viên (ma_nv) từ UI, cần quy về id UUID
    // thật của tài khoản trước khi so khớp với cong_viec_phu_trach.tai_khoan_id.
    const accountIds = await resolveAccountIds(supabase, filters.assigneeIds, "Người phụ trách");
    const { data, error } = await supabase
      .from("cong_viec_phu_trach")
      .select("cong_viec_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    taskIdsFromAssignees = uniqueValues((data ?? []).map((row) => row.cong_viec_id as string));
    if (taskIdsFromAssignees.length === 0) return { items: [], total: 0 };
  }

  let query = supabase
    .from("cong_viec")
    .select(WORK_TASK_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_cv", `%${filters.search.trim()}%`);
  }
  if (filters.projectId) query = query.eq("du_an_id", filters.projectId);
  if (taskIdsFromAssignees) query = query.in("id", taskIdsFromAssignees);
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

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const { data, error, count } = await query.range(from, to);
  throwDatabaseError(error);
  const items = hydrateWorkTasks((data ?? []) as unknown as WorkTaskRow[]);
  return { items, total: count ?? 0 };
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
  const [task] = hydrateWorkTasks([data as unknown as WorkTaskRow]);
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
  if (accountIds.length > 0) {
    const { error: upsertError } = await supabase.from(table).upsert(
      accountIds.map((accountId) => ({
        [ownerColumn]: ownerId,
        tai_khoan_id: accountId,
        la_chinh: accountId === accountIds[0],
      })),
      { onConflict: `${ownerColumn},tai_khoan_id` }
    );
    throwDatabaseError(upsertError);
  }

  let deleteQuery = supabase.from(table).delete().eq(ownerColumn, ownerId);
  if (accountIds.length > 0) {
    deleteQuery = deleteQuery.not("tai_khoan_id", "in", `(${toPostgrestInValues(accountIds)})`);
  }
  const { error: deleteError } = await deleteQuery;
  throwDatabaseError(deleteError);
}

function assignmentRows(
  accountIds: string[],
  accountsById: Map<string, AccountRow>
): AssignmentEmbedRow[] {
  return accountIds.map((accountId) => ({
    tai_khoan_id: accountId,
    la_chinh: accountId === accountIds[0],
    tai_khoan: accountsById.get(accountId) ?? null,
  }));
}

function withWorkTaskAssignees(
  row: WorkTaskRow,
  assigneeIds: string[],
  accountsById: Map<string, AccountRow>
): WorkTaskRow {
  return {
    ...row,
    legacy_assignee: accountsById.get(assigneeIds[0]) ?? row.legacy_assignee,
    cong_viec_phu_trach: assignmentRows(assigneeIds, accountsById),
  };
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

/** Ngày công việc phải nằm hoàn toàn trong thời gian dự án. */
async function assertWorkTaskScheduleWithinProject(
  supabase: ApiSupabaseClient,
  projectId: string,
  startDate: string,
  dueDate: string
): Promise<void> {
  const { data, error } = await supabase
    .from("du_an")
    .select("ngay_bd, ngay_kt")
    .eq("id", projectId)
    .maybeSingle();
  throwDatabaseError(error);

  if (!data) {
    throw new ApiException("Không tìm thấy dự án cho công việc.", 400);
  }

  const projectStartDate = data.ngay_bd as string | null;
  const projectEndDate = data.ngay_kt as string | null;
  if (!projectStartDate || !projectEndDate) {
    throw new ApiException("Dự án chưa có thời gian làm việc hợp lệ.", 400);
  }

  if (
    startDate < projectStartDate ||
    startDate > projectEndDate ||
    dueDate < projectStartDate ||
    dueDate > projectEndDate
  ) {
    throw new ApiException(
      "Thời gian công việc phải nằm trong khoảng thời gian của dự án.",
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

/** Ngày task phải nằm hoàn toàn trong thời gian công việc cha. */
async function assertSubtaskScheduleWithinWorkTask(
  supabase: ApiSupabaseClient,
  workTaskId: string,
  startDate: string,
  dueDate: string
): Promise<void> {
  const { data, error } = await supabase
    .from("cong_viec")
    .select("ngay_bat_dau, ngay_hoan_thanh")
    .eq("id", workTaskId)
    .maybeSingle();
  throwDatabaseError(error);

  if (!data) {
    throw new ApiException("Không tìm thấy công việc cho task.", 400);
  }

  const workTaskStartDate = data.ngay_bat_dau as string | null;
  const workTaskDueDate = data.ngay_hoan_thanh as string | null;
  if (!workTaskStartDate || !workTaskDueDate) {
    throw new ApiException("Công việc chưa có thời gian làm việc hợp lệ.", 400);
  }

  if (
    startDate < workTaskStartDate ||
    startDate > workTaskDueDate ||
    dueDate < workTaskStartDate ||
    dueDate > workTaskDueDate
  ) {
    throw new ApiException(
      "Thời gian task phải nằm trong khoảng thời gian của công việc.",
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
    uu_tien: input.priority,
    ngay_bat_dau: input.startDate,
    ngay_hoan_thanh: input.dueDate,
    nhan_tag: input.tags,
    cong_viec_tien_de_id: input.dependsOnTaskId ?? null,
    hinh_anh: input.images,
    tep_dinh_kem: input.files,
    lien_ket_dinh_kem: input.links,
  };
}

export async function createWorkTask(
  supabase: ApiSupabaseClient,
  input: WorkTaskInput
): Promise<WorkTask> {
  const [{ ids: assigneeIds, accountsById }] = await Promise.all([
    resolveAccounts(supabase, input.assigneeIds, "Người phụ trách"),
    assertWorkTaskScheduleWithinProject(
      supabase,
      input.projectId,
      input.startDate,
      input.dueDate
    ),
  ]);
  await assertProjectParticipants(supabase, input.projectId, assigneeIds);

  const payload = {
    ...(await workTaskPayload(input, assigneeIds[0])),
    // Công việc mới chưa có Task con nên luôn bắt đầu ở trạng thái Cần làm.
    trang_thai: "todo",
  };
  const { data, error } = await supabase
    .from("cong_viec")
    .insert(payload)
    .select(WORK_TASK_SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về công việc vừa tạo.", 500);
  const taskRow = data as unknown as WorkTaskRow;

  const taskId = taskRow.id;
  try {
    await syncAssignments(
      supabase,
      "cong_viec_phu_trach",
      "cong_viec_id",
      taskId,
      assigneeIds
    );
  } catch (syncError) {
    // Không phải RPC transaction thật (2 round-trip riêng) — nhưng bù lại bằng
    // compensating delete, cùng mẫu đã dùng ở createProject(), để không để lại
    // công việc không có người phụ trách khi bước gán lỗi.
    await supabase.from("cong_viec").delete().eq("id", taskId);
    throw syncError;
  }

  const [task] = hydrateWorkTasks([
    withWorkTaskAssignees(taskRow, assigneeIds, accountsById),
  ]);
  return task;
}

export async function updateWorkTask(
  supabase: ApiSupabaseClient,
  id: string,
  input: WorkTaskInput
): Promise<WorkTask | null> {
  const current = await getWorkTask(supabase, id);
  if (!current) return null;
  if (current.status === "done") {
    throw new ApiException(
      "Công việc đã hoàn thành nên chỉ có thể xem, không thể chỉnh sửa.",
      409
    );
  }

  const [{ ids: assigneeIds, accountsById }] = await Promise.all([
    resolveAccounts(supabase, input.assigneeIds, "Người phụ trách"),
    assertWorkTaskScheduleWithinProject(
      supabase,
      input.projectId,
      input.startDate,
      input.dueDate
    ),
  ]);
  await assertProjectParticipants(supabase, input.projectId, assigneeIds);
  // Task con chỉ được giao cho người còn phụ trách công việc này.
  await assertSubtaskAssigneesStillValid(supabase, id, assigneeIds);

  const payload = await workTaskPayload(input, assigneeIds[0]);
  const { data, error } = await supabase
    .from("cong_viec")
    .update(payload)
    .eq("id", id)
    .neq("trang_thai", "done")
    .select(WORK_TASK_SELECT)
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

  const [task] = hydrateWorkTasks([
    withWorkTaskAssignees(data as unknown as WorkTaskRow, assigneeIds, accountsById),
  ]);
  return task;
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
  const current = await getWorkTask(supabase, id);
  if (!current) return false;
  if (current.status === "done") {
    throw new ApiException(
      "Công việc đã hoàn thành nên chỉ có thể xem, không thể xóa.",
      409
    );
  }

  const { data, error } = await supabase
    .from("cong_viec")
    .delete()
    .eq("id", id)
    .neq("trang_thai", "done")
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

export async function listProjectTasks(
  supabase: ApiSupabaseClient,
  projectId: string,
  assigneeIds?: string[]
): Promise<ProjectTask[]> {
  const tasks = await listWorkTasks(supabase, { projectId, assigneeIds });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: task.assignees[0] ?? emptyProjectMember(),
    assignees: task.assignees,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    progress: task.progress,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));
}

/**
 * Không còn cần round-trip riêng cho người phụ trách: `SUBTASK_SELECT` đã lấy
 * kèm (embed) `task_phu_trach` và `legacy_assignee` trong cùng một truy vấn.
 */
function hydrateSubtasks(rows: SubtaskRow[]): Subtask[] {
  return rows.map((row) => {
    const assignees = (row.task_phu_trach ?? [])
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan)
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember);
    const primary =
      assignees[0] ?? (row.legacy_assignee ? toProjectMember(row.legacy_assignee) : undefined);

    return {
      id: row.id,
      title: row.ten_task,
      description: row.mo_ta ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workTaskId: row.cong_viec_id,
      assigneeId: primary?.id ?? "",
      assignees: assignees.length > 0 ? assignees : primary ? [primary] : [],
      creator: row.creator ? toProjectMember(row.creator) : undefined,
      testerId: row.nguoi_test_id ?? undefined,
      tester: row.tester ? toProjectMember(row.tester) : undefined,
      testNote: row.ghi_chu_test ?? undefined,
      acceptedAssigneeIds: (row.task_phu_trach ?? [])
        .filter((assignment) => Boolean(assignment.xac_nhan_luc))
        .map((assignment) => assignment.tai_khoan_id),
      status: normalizeSubtaskStatus(row.trang_thai, row.tien_do_thuc_te),
      priority: toPriority(row.uu_tien),
      startDate: row.ngay_bat_dau ?? "",
      dueDate: row.ngay_ket_thuc ?? "",
      progress: row.tien_do_thuc_te,
      tags: row.nhan_tag ?? [],
      files: row.tep_dinh_kem ?? [],
      links: row.lien_ket_dinh_kem ?? [],
      images: row.hinh_anh ?? [],
      updates: row.cap_nhat_bo_sung ?? [],
    };
  });
}

export async function listSubtasks(
  supabase: ApiSupabaseClient,
  filters: SubtaskFilters = {}
): Promise<Subtask[]> {
  let subtaskIdsFromAssignees: string[] | undefined;
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    const accountIds = await resolveAccountIds(supabase, filters.assigneeIds, "Người thực hiện");
    const { data, error } = await supabase
      .from("task_phu_trach")
      .select("task_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    subtaskIdsFromAssignees = uniqueValues((data ?? []).map((row) => row.task_id as string));
    if (subtaskIdsFromAssignees.length === 0) return [];
  }

  let query = supabase
    .from("task")
    .select(SUBTASK_SELECT)
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_task", `%${filters.search.trim()}%`);
  }
  if (filters.workTaskId) query = query.eq("cong_viec_id", filters.workTaskId);
  if (subtaskIdsFromAssignees) query = query.in("id", subtaskIdsFromAssignees);
  if (filters.assigneeId) {
    const accountId = await resolveAccountId(
      supabase,
      filters.assigneeId,
      "Người phụ trách"
    );
    query = query.eq("nguoi_phu_trach_id", accountId);
  }
  if (filters.testerId) query = query.eq("nguoi_test_id", filters.testerId);
  if (filters.priorities?.length) query = query.in("uu_tien", filters.priorities);
  else if (filters.priority) query = query.eq("uu_tien", filters.priority);
  if (filters.statuses?.length) query = query.in("trang_thai", filters.statuses.map(toDatabaseStatus));
  else if (filters.status) query = query.eq("trang_thai", toDatabaseStatus(filters.status));
  if (filters.overdueOnly) {
    query = query
      .neq("trang_thai", "done")
      .lt("ngay_ket_thuc", getAppDateKey());
  }

  const { data, error } = await query;
  throwDatabaseError(error);
  return hydrateSubtasks((data ?? []) as unknown as SubtaskRow[]);
}

/**
 * Giống `listSubtasks` nhưng chỉ tải một trang kết quả, có thêm lọc theo dự án
 * (qua bảng công việc cha) và nhiều người thực hiện (qua bảng task_phu_trach).
 */
export async function listSubtasksPage(
  supabase: ApiSupabaseClient,
  filters: SubtaskListFilters
): Promise<PagedResult<Subtask>> {
  let workTaskIds: string[] | undefined;
  if (filters.projectId) {
    const { data, error } = await supabase
      .from("cong_viec")
      .select("id")
      .eq("du_an_id", filters.projectId);
    throwDatabaseError(error);
    workTaskIds = (data ?? []).map((row) => row.id as string);
    if (workTaskIds.length === 0) return { items: [], total: 0 };
  }
  // Kết hợp với danh sách công việc chọn thủ công (bộ lọc "Công việc" nhiều lựa chọn).
  if (filters.workTaskIds && filters.workTaskIds.length > 0) {
    workTaskIds = workTaskIds
      ? workTaskIds.filter((id) => filters.workTaskIds!.includes(id))
      : filters.workTaskIds;
    if (workTaskIds.length === 0) return { items: [], total: 0 };
  }

  let subtaskIdsFromAssignees: string[] | undefined;
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    // `assigneeIds` có thể là mã nhân viên (ma_nv) từ UI, cần quy về id UUID
    // thật của tài khoản trước khi so khớp với task_phu_trach.tai_khoan_id.
    const accountIds = await resolveAccountIds(supabase, filters.assigneeIds, "Người thực hiện");
    const { data, error } = await supabase
      .from("task_phu_trach")
      .select("task_id")
      .in("tai_khoan_id", accountIds);
    throwDatabaseError(error);
    subtaskIdsFromAssignees = uniqueValues((data ?? []).map((row) => row.task_id as string));
    if (subtaskIdsFromAssignees.length === 0) return { items: [], total: 0 };
  }

  let query = supabase
    .from("task")
    .select(SUBTASK_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.search?.trim()) {
    query = query.ilike("ten_task", `%${filters.search.trim()}%`);
  }
  if (filters.workTaskId) query = query.eq("cong_viec_id", filters.workTaskId);
  if (workTaskIds) query = query.in("cong_viec_id", workTaskIds);
  if (subtaskIdsFromAssignees) query = query.in("id", subtaskIdsFromAssignees);
  if (filters.assigneeId) {
    const accountId = await resolveAccountId(
      supabase,
      filters.assigneeId,
      "Người phụ trách"
    );
    query = query.eq("nguoi_phu_trach_id", accountId);
  }
  if (filters.testerId) query = query.eq("nguoi_test_id", filters.testerId);
  if (filters.priorities?.length) query = query.in("uu_tien", filters.priorities);
  else if (filters.priority) query = query.eq("uu_tien", filters.priority);
  if (filters.statuses?.length) query = query.in("trang_thai", filters.statuses.map(toDatabaseStatus));
  else if (filters.status) query = query.eq("trang_thai", toDatabaseStatus(filters.status));
  if (filters.overdueOnly) {
    query = query
      .neq("trang_thai", "done")
      .lt("ngay_ket_thuc", getAppDateKey());
  }

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const { data, error, count } = await query.range(from, to);
  throwDatabaseError(error);
  const items = hydrateSubtasks((data ?? []) as unknown as SubtaskRow[]);
  return { items, total: count ?? 0 };
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
  const [subtask] = hydrateSubtasks([data as unknown as SubtaskRow]);
  return subtask;
}

function subtaskPayload(
  input: SubtaskInput,
  primaryAccountId: string,
  testerAccountId: string | null,
  progress: number,
  status: TaskStatus
) {
  return {
    ten_task: input.title,
    mo_ta: input.description ?? null,
    ngay_bat_dau: input.startDate,
    ngay_ket_thuc: input.dueDate,
    nguoi_phu_trach_id: primaryAccountId,
    nguoi_test_id: testerAccountId,
    trang_thai: toDatabaseStatus(status),
    uu_tien: input.priority,
    tien_do_thuc_te: progress,
    nhan_tag: input.tags,
    hinh_anh: input.images,
    tep_dinh_kem: input.files,
    lien_ket_dinh_kem: input.links,
    cap_nhat_bo_sung: input.updates,
    cong_viec_id: input.workTaskId,
  };
}

export async function createSubtask(
  supabase: ApiSupabaseClient,
  input: SubtaskInput,
  creatorAccountId: string
): Promise<Subtask> {
  const parentWorkTask = await getWorkTask(supabase, input.workTaskId);
  if (!parentWorkTask) throw new ApiException("Không tìm thấy công việc.", 404);

  const [{ ids: assigneeIds }, testerAccountId] = await Promise.all([
    resolveAccounts(supabase, input.assigneeIds, "Người phụ trách"),
    input.testerId
      ? resolveAccountId(supabase, input.testerId, "Người test")
      : Promise.resolve(null),
    assertSubtaskScheduleWithinWorkTask(
      supabase,
      input.workTaskId,
      input.startDate,
      input.dueDate
    ),
  ]);
  await assertWorkTaskAssignees(supabase, input.workTaskId, assigneeIds);

  const { data, error } = await supabase
    .from("task")
    .insert({
      ...subtaskPayload(input, assigneeIds[0], testerAccountId, 0, "todo"),
      nguoi_tao_id: creatorAccountId,
    })
    .select(SUBTASK_SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về task vừa tạo.", 500);
  const subtaskRow = data as unknown as SubtaskRow;

  const subtaskId = subtaskRow.id;
  try {
    await syncAssignments(
      supabase,
      "task_phu_trach",
      "task_id",
      subtaskId,
      assigneeIds
    );
  } catch (syncError) {
    // Xem chú thích tương ứng trong createWorkTask() — compensating delete, không
    // phải RPC transaction thật.
    await supabase.from("task").delete().eq("id", subtaskId);
    throw syncError;
  }

  const subtask = await getSubtask(supabase, subtaskId);
  if (!subtask) throw new ApiException("Không thể đọc lại task vừa tạo.", 500);
  return subtask;
}

export async function updateSubtask(
  supabase: ApiSupabaseClient,
  id: string,
  input: SubtaskInput
): Promise<Subtask | null> {
  const { data: currentRow, error: currentError } = await supabase
    .from("task")
    .select("tien_do_thuc_te,trang_thai")
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(currentError);
  if (!currentRow) return null;

  const currentProgress = Number(currentRow.tien_do_thuc_te);
  const currentStatus = normalizeSubtaskStatus(
    String(currentRow.trang_thai),
    currentProgress
  );
  if (currentStatus === "done") {
    throw new ApiException(
      "Task đã hoàn thành nên chỉ có thể xem, không thể chỉnh sửa.",
      409
    );
  }
  const nextStatus =
    input.status ?? currentStatus;
  const nextProgress = input.status
    ? progressForSubtaskStatus(input.status, currentProgress)
    : currentProgress;

  const [{ ids: assigneeIds }, testerAccountId] = await Promise.all([
    resolveAccounts(supabase, input.assigneeIds, "Người phụ trách"),
    input.testerId
      ? resolveAccountId(supabase, input.testerId, "Người test")
      : Promise.resolve(null),
    assertSubtaskScheduleWithinWorkTask(
      supabase,
      input.workTaskId,
      input.startDate,
      input.dueDate
    ),
  ]);
  if (nextStatus === "testing" && !testerAccountId) {
    throw new ApiException("Task ở trạng thái Chờ test phải có người test.", 400);
  }
  await assertWorkTaskAssignees(supabase, input.workTaskId, assigneeIds);

  const { data, error } = await supabase
    .from("task")
    .update(
      subtaskPayload(
        input,
        assigneeIds[0],
        testerAccountId,
        nextProgress,
        nextStatus
      )
    )
    .eq("id", id)
    .select(SUBTASK_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncAssignments(supabase, "task_phu_trach", "task_id", id, assigneeIds);
  return getSubtask(supabase, id);
}

/** Nhân viên xác nhận nhận Task; lần xác nhận đầu tiên đưa Task sang "Đang làm". */
export async function acceptSubtaskAssignment(
  supabase: ApiSupabaseClient,
  subtaskId: string,
  accountId: string
): Promise<Subtask> {
  const { data: assignment, error: assignmentError } = await supabase
    .from("task_phu_trach")
    .select("xac_nhan_luc")
    .eq("task_id", subtaskId)
    .eq("tai_khoan_id", accountId)
    .maybeSingle();
  throwDatabaseError(assignmentError);
  if (!assignment) {
    throw new ApiException("Bạn không phải người được giao Task này.", 403);
  }

  if (!assignment.xac_nhan_luc) {
    const { error: acceptError } = await supabase
      .from("task_phu_trach")
      .update({ xac_nhan_luc: new Date().toISOString() })
      .eq("task_id", subtaskId)
      .eq("tai_khoan_id", accountId);
    throwDatabaseError(acceptError);
  }

  const { data: taskRow, error: taskError } = await supabase
    .from("task")
    .select("trang_thai,tien_do_thuc_te")
    .eq("id", subtaskId)
    .maybeSingle();
  throwDatabaseError(taskError);
  if (!taskRow) throw new ApiException("Không tìm thấy Task.", 404);

  if (toApiStatus(String(taskRow.trang_thai)) === "todo" && Number(taskRow.tien_do_thuc_te) < 100) {
    const { error: statusError } = await supabase
      .from("task")
      .update({ trang_thai: "in_progress" })
      .eq("id", subtaskId)
      .eq("trang_thai", "todo");
    throwDatabaseError(statusError);
  }

  const { error: notificationError } = await supabase
    .from("thong_bao")
    .update({ da_doc: true })
    .eq("tai_khoan_id", accountId)
    .eq("task_id", subtaskId)
    .eq("loai", "task_assigned");
  throwDatabaseError(notificationError);

  const subtask = await getSubtask(supabase, subtaskId);
  if (!subtask) throw new ApiException("Không tìm thấy Task.", 404);
  return subtask;
}

export async function deleteSubtask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const current = await getSubtask(supabase, id);
  if (!current) return false;
  if (current.status === "done") {
    throw new ApiException(
      "Task đã hoàn thành nên chỉ có thể xem, không thể xóa.",
      409
    );
  }

  const { data, error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .neq("trang_thai", "done")
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

function hydrateTaskActivity(rows: TaskActivityRow[]): TaskActivityEvent[] {
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    type: row.loai,
    title: row.tieu_de,
    detail: row.chi_tiet ?? undefined,
    actorId: row.tac_gia ? accountReference(row.tac_gia) : undefined,
    actorName: row.tac_gia?.ten_nv,
    actorColor: row.tac_gia ? avatarColor(row.tac_gia.id) : undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Nhật ký hoạt động Task (tạo, xác nhận, đổi trạng thái, báo cáo, duyệt, sửa) — được ghi
 * bằng trigger ở tầng database (xem migration `task_activity_log`), API chỉ đọc lại.
 * Có phân trang vì Task hoạt động lâu ngày có thể phát sinh rất nhiều sự kiện.
 */
export async function listSubtaskActivity(
  supabase: ApiSupabaseClient,
  subtaskId: string,
  page = 1,
  pageSize = TASK_ACTIVITY_PAGE_SIZE
): Promise<PagedResult<TaskActivityEvent>> {
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await supabase
    .from("task_hoat_dong")
    .select(TASK_ACTIVITY_SELECT, { count: "exact" })
    .eq("task_id", subtaskId)
    .order("created_at", { ascending: false })
    .range(from, to);
  throwDatabaseError(error);
  const items = hydrateTaskActivity((data ?? []) as unknown as TaskActivityRow[]);
  return { items, total: count ?? 0 };
}

/** Lấy các lần Pass/Fail theo thứ tự mới nhất trước. */
export async function listSubtaskTestHistory(
  supabase: ApiSupabaseClient,
  subtaskId: string
): Promise<SubtaskTestHistoryEntry[]> {
  const { data, error } = await supabase
    .from("task_lich_su_test")
    .select(SUBTASK_TEST_HISTORY_SELECT)
    .eq("task_id", subtaskId)
    .order("created_at", { ascending: false });
  throwDatabaseError(error);
  return ((data ?? []) as unknown as SubtaskTestHistoryRow[]).map((row) => ({
    id: row.id,
    subtaskId: row.task_id,
    tester: row.tester ? toProjectMember(row.tester) : undefined,
    result: row.ket_qua,
    note: row.ghi_chu ?? undefined,
    createdAt: row.created_at,
  }));
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

export async function removeTaskReportFiles(
  supabase: ApiSupabaseClient,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(TASK_REPORT_BUCKET).remove(paths);
  throwDatabaseError(error);
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
  if (subtask.status === "done") {
    throw new ApiException(
      "Task đã hoàn thành nên chỉ có thể xem, không thể gửi thêm báo cáo.",
      409
    );
  }

  const testerAccountId = input.testerId
    ? await resolveAccountId(supabase, input.testerId, "Người test")
    : subtask.testerId;
  if (input.progress === 100 && !testerAccountId) {
    throw new ApiException("Vui lòng chọn người test trước khi gửi báo cáo 100%.", 400);
  }

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

  if (input.progress === 100 || input.progress !== subtask.progress) {
    const { error: progressError } = await supabase
      .from("task")
      .update({
        tien_do_thuc_te: input.progress,
        ...(testerAccountId ? { nguoi_test_id: testerAccountId } : {}),
        trang_thai: toDatabaseStatus(deriveSubtaskStatus(input.progress)),
      })
      .eq("id", subtaskId);
    throwDatabaseError(progressError);
  }

  const report = await getSubtaskReport(supabase, reportId);
  if (!report) throw new ApiException("Không thể đọc lại báo cáo vừa tạo.", 500);
  return report;
}

/** Chỉ tester được gán hoặc admin được ghi kết quả kiểm thử. */
export async function assertTesterOfSubtask(
  supabase: ApiSupabaseClient,
  taskId: string
): Promise<void> {
  const authUserId = await resolveAuthUserId(supabase);
  if (!authUserId) throw new ApiException("Bạn cần đăng nhập để thực hiện thao tác này.", 401);
  const { data: account, error: accountError } = await supabase
    .from("tai_khoan")
    .select("id,role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  throwDatabaseError(accountError);
  if (!account) throw new ApiException("Không tìm thấy tài khoản.", 403);
  if (account.role === "admin") return;
  const { data: task, error: taskError } = await supabase
    .from("task")
    .select("nguoi_test_id")
    .eq("id", taskId)
    .maybeSingle();
  throwDatabaseError(taskError);
  if (!task || task.nguoi_test_id !== account.id) {
    throw new ApiException("Chỉ người được gán test Task này mới được thao tác.", 403);
  }
}

export async function submitSubtaskTestResult(
  supabase: ApiSupabaseClient,
  id: string,
  result: SubtaskTestResult
): Promise<Subtask | null> {
  const subtask = await getSubtask(supabase, id);
  if (!subtask) return null;
  if (subtask.status !== "testing") {
    throw new ApiException("Chỉ có thể ghi kết quả khi Task đang Chờ test.", 400);
  }
  const note = result.note?.trim();
  if (!result.passed && !note) {
    throw new ApiException("Cần ghi rõ lỗi khi báo Fail.", 400);
  }
  const update = result.passed
    ? { trang_thai: toDatabaseStatus("review"), ghi_chu_test: null }
    : { trang_thai: toDatabaseStatus("inProgress"), tien_do_thuc_te: 99, ghi_chu_test: note };
  const { data, error } = await supabase
    .from("task")
    .update(update)
    .eq("id", id)
    .eq("trang_thai", "testing")
    .select(SUBTASK_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Task đã được xử lý bởi một người khác.", 409);
  const [updated] = hydrateSubtasks([data as unknown as SubtaskRow]);
  return updated;
}

/** Xác thực người gọi API hiện tại có role admin trong bảng tài khoản. */
export async function assertAdminAccount(supabase: ApiSupabaseClient): Promise<void> {
  await measureApiTiming("auth", async () => {
    const authUserId = await resolveAuthUserId(supabase);
    if (!authUserId) throw new ApiException("Bạn cần đăng nhập để thực hiện thao tác này.", 401);

    const { data, error } = await supabase
      .from("tai_khoan")
      .select("role")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    throwDatabaseError(error);

    if (!data || data.role !== "admin") {
      throw new ApiException("Chỉ quản trị viên mới được thực hiện thao tác này.", 403);
    }
  });
}

/**
 * Duyệt Task con đã báo cáo tiến độ 100% ("Chờ duyệt") sang "Hoàn thành".
 * Quản trị viên cũng có thể chỉnh trạng thái trực tiếp trong form chỉnh sửa Task.
 */
export async function approveSubtask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<Subtask | null> {
  const subtask = await getSubtask(supabase, id);
  if (!subtask) return null;
  if (subtask.status !== "review" || subtask.progress !== 100) {
    throw new ApiException(
      "Chỉ có thể duyệt task đã báo cáo tiến độ 100% và đang chờ đánh giá.",
      400
    );
  }

  const { data, error } = await supabase
    .from("task")
    .update({ trang_thai: toDatabaseStatus("done") })
    .eq("id", id)
    .select(SUBTASK_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  const [approved] = hydrateSubtasks([data as unknown as SubtaskRow]);
  return approved;
}
