import { decodeHandover, detailTaskProgressPercent, encodeHandoverContent } from "@/lib/handover";
import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, isSchemaCacheError, throwDatabaseError } from "@/lib/api/response";
import { resolveAuthUserId, type RequestAccountAccess } from "@/lib/supabase/authorization";
import {
  DEFAULT_PROJECT_STEPS,
  type Project,
  type ProjectColor,
  type ProjectDirectoryItem,
  type ProjectInput,
  type ProjectMember,
  type ProjectOption,
  type ProjectStepConfig,
} from "@/types/project";
import type {
  Subtask,
  SubtaskHandover,
  SubtaskInput,
  SubtaskIssueEntry,
  SubtaskPromptItem,
  SubtaskTimeRecord,
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
  WorkTaskOption,
} from "@/types/task";
import { deriveWorkTaskStatus } from "@/types/task";
import type {
  DutyChecklistItem,
  DutyChecklistToggleResult,
  DutyChecklistTemplate,
  DutyChecklistTemplateInput,
  DutyRecurringRule,
  DutyRecurringRuleInput,
  DutyShift,
  DutyShiftInput,
  DutyShiftStatus,
  DutySource,
} from "@/types/duty";
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
  mo_ta?: string | null;
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
  hinh_anh?: string[] | null;
  tep_dinh_kem?: TaskFileAttachment[] | null;
  lien_ket_dinh_kem?: TaskLinkAttachment[] | null;
  cap_nhat_bo_sung?: SubtaskUpdateEntry[] | null;
  van_de_giai_phap?: unknown;
  ban_giao_noi_dung?: string | null;
  ban_giao_link_anh?: string | null;
  task_tien_de_id?: string | null;
  cong_viec_id: string;
  nguoi_tao_id: string | null;
  /** Người phụ trách chính "cũ" (cột nguoi_phu_trach_id), lấy kèm qua embed. */
  legacy_assignee: AccountRow | null;
  /** Danh sách người phụ trách đầy đủ, lấy kèm qua embed thay vì round-trip riêng. */
  task_phu_trach: AssignmentEmbedRow[];
  /** Người tạo Task, lấy kèm để hiển thị trong danh sách. */
  creator: AccountRow | null;
  tester: AccountRow | null;
  /** Chỉ có khi select chi tiết (`SUBTASK_DETAIL_SELECT`). */
  prompt_items?: unknown;
  /** Chỉ có trên select danh sách: công việc cha và tên dự án. */
  parent_work_task?: {
    id: string;
    ten_cv: string;
    du_an_id: string;
    parent_project: { id: string; ten_da: string } | null;
  } | null;
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
/** Danh sách dự án: giữ mô tả, thành viên và thống kê, bỏ file/ảnh/steps. */
const PROJECT_LIST_SELECT =
  "id,ma_da,ten_da,hop_mau,mo_ta,ngay_bd,ngay_kt,nguoi_ql_id," +
  `legacy_manager:tai_khoan!nguoi_ql_id(${ACCOUNT_SELECT}),` +
  `du_an_quan_ly(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  `du_an_thanh_vien(tai_khoan_id,tai_khoan(${ACCOUNT_SELECT})),` +
  "cong_viec(id,trang_thai,ngay_hoan_thanh)";
/** Form công việc cần người tham gia và ngày, không cần thống kê/đính kèm của mọi dự án. */
const PROJECT_FORM_SELECT =
  "id,ma_da,ten_da,hop_mau,mo_ta,ngay_bd,ngay_kt,nguoi_ql_id,steps," +
  `legacy_manager:tai_khoan!nguoi_ql_id(${ACCOUNT_SELECT}),` +
  `du_an_quan_ly(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  `du_an_thanh_vien(tai_khoan_id,tai_khoan(${ACCOUNT_SELECT}))`;
const PROJECT_OPTION_SELECT = "id,ma_da,ten_da";
/** Dashboard chỉ cần mã/tên/ngày — bỏ mô tả, đính kèm, thành viên và embed công việc. */
const PROJECT_DASHBOARD_SELECT = "id,ma_da,ten_da,hop_mau,ngay_bd,ngay_kt";
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
/** Thẻ công việc trong dự án không cần file/ảnh/link. */
const WORK_TASK_SUMMARY_SELECT =
  "id,ten_cv,mo_ta,created_at,updated_at,du_an_id,nguoi_phu_trach_id,trang_thai,uu_tien,ngay_bat_dau,ngay_hoan_thanh,tien_do_thuc_te,nhan_tag,cong_viec_tien_de_id," +
  `legacy_assignee:tai_khoan!nguoi_phu_trach_id(${ACCOUNT_SELECT}),` +
  `cong_viec_phu_trach(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  "task(tien_do_thuc_te,trang_thai)";
/** Dashboard giữ assignee + tiến độ task con; bỏ mô tả/đính kèm/tag. */
const WORK_TASK_DASHBOARD_SELECT =
  "id,ten_cv,created_at,updated_at,du_an_id,nguoi_phu_trach_id,uu_tien,ngay_bat_dau,ngay_hoan_thanh," +
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
/** Chi tiết Task cần thêm prompt_items / van_de_giai_phap; danh sách bỏ qua để giảm payload. */
const SUBTASK_DETAIL_SELECT = `${SUBTASK_SELECT},prompt_items,van_de_giai_phap,ban_giao_noi_dung,ban_giao_link_anh`;
/** Fallback khi deployment chưa có cột van_de_giai_phap. */
const SUBTASK_DETAIL_SELECT_WITHOUT_ISSUES = `${SUBTASK_SELECT},prompt_items`;
/** Task detail page data, including its parent task in the same request. */
const SUBTASK_PAGE_DETAIL_SELECT =
  `${SUBTASK_DETAIL_SELECT},parent_work_task:cong_viec!task_cong_viec_id_fkey(${WORK_TASK_DIRECTORY_SELECT})`;
const SUBTASK_PAGE_DETAIL_SELECT_WITHOUT_ISSUES =
  `${SUBTASK_DETAIL_SELECT_WITHOUT_ISSUES},parent_work_task:cong_viec!task_cong_viec_id_fkey(${WORK_TASK_DIRECTORY_SELECT})`;
/** Danh sách bảng: bỏ mô tả/đính kèm/cập nhật bổ sung để giảm payload. */
const SUBTASK_LIST_SELECT =
  "id,ten_task,created_at,updated_at,ngay_bat_dau,ngay_ket_thuc,nguoi_phu_trach_id,nguoi_tao_id,nguoi_test_id,ghi_chu_test,trang_thai,uu_tien,tien_do_thuc_te,nhan_tag,cong_viec_id," +
  "parent_work_task:cong_viec!task_cong_viec_id_fkey(id,ten_cv,du_an_id,parent_project:du_an!cong_viec_du_an_id_fkey(id,ten_da))," +
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
      color: projectColor(row.hop_mau ?? "purple"),
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
  memberIds: string[],
  options?: { assumeEmpty?: boolean }
): Promise<void> {
  if (!options?.assumeEmpty) {
    const { data: current, error: currentError } = await supabase
      .from("du_an_thanh_vien")
      .select("tai_khoan_id")
      .eq("du_an_id", projectId);
    throwDatabaseError(currentError);
    const currentIds = (current ?? []).map((row) => row.tai_khoan_id as string);
    const currentSet = new Set(currentIds);
    if (
      currentIds.length === memberIds.length &&
      memberIds.every((accountId) => currentSet.has(accountId))
    ) {
      return;
    }
  }

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
  managerIds: string[],
  options?: { assumeEmpty?: boolean }
): Promise<void> {
  if (!options?.assumeEmpty) {
    const { data: current, error: currentError } = await supabase
      .from("du_an_quan_ly")
      .select("tai_khoan_id,la_chinh")
      .eq("du_an_id", projectId);
    throwDatabaseError(currentError);
    const currentRows = current ?? [];
    const currentIds = currentRows.map((row) => row.tai_khoan_id as string);
    const currentPrimary = currentRows.find((row) => row.la_chinh)?.tai_khoan_id as
      | string
      | undefined;
    const currentSet = new Set(currentIds);
    const sameMembers =
      currentIds.length === managerIds.length &&
      managerIds.every((accountId) => currentSet.has(accountId));
    const samePrimary = (managerIds[0] ?? null) === (currentPrimary ?? null);
    if (sameMembers && samePrimary) return;
  }

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
  memberIds: string[],
  options?: { assumeEmpty?: boolean }
): Promise<void> {
  const results = await Promise.all([
    syncProjectManagers(supabase, projectId, managerIds, options).then(
      () => undefined,
      (error: unknown) => error
    ),
    syncProjectMembers(supabase, projectId, memberIds, options).then(
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

export async function listProjectOptions(
  supabase: ApiSupabaseClient,
  search?: string,
  participantAccountId?: string
): Promise<ProjectOption[]> {
  const visibleProjectIds = participantAccountId
    ? await listProjectIdsForParticipant(supabase, participantAccountId)
    : undefined;
  if (visibleProjectIds?.length === 0) return [];

  let query = supabase
    .from("du_an")
    .select(PROJECT_OPTION_SELECT)
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
  return ((data ?? []) as Array<{ id: string; ma_da: string; ten_da: string }>).map((row) => ({
    id: row.id,
    code: row.ma_da,
    name: row.ten_da,
  }));
}

export async function listProjects(
  supabase: ApiSupabaseClient,
  search?: string,
  participantAccountId?: string,
  compact = false
): Promise<Project[]> {
  const visibleProjectIds = participantAccountId
    ? await listProjectIdsForParticipant(supabase, participantAccountId)
    : undefined;
  if (visibleProjectIds?.length === 0) return [];

  let query = supabase
    .from("du_an")
    .select(compact ? PROJECT_FORM_SELECT : PROJECT_SELECT)
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
  filters: {
    search?: string;
    managerIds?: string[];
    participantAccountId?: string;
    page: number;
    pageSize: number;
    /** Bỏ mô tả/đính kèm/thành viên/embed công việc — dùng cho dashboard. */
    lite?: boolean;
  }
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

  const select = filters.lite ? PROJECT_DASHBOARD_SELECT : PROJECT_LIST_SELECT;
  const applyProjectFilters = (query: any) => {
    let next = query;
    const term = filters.search?.trim();
    if (term) {
      const safeTerm = term.replace(/[,().%_]/g, " ").trim();
      if (safeTerm) next = next.or(`ten_da.ilike.%${safeTerm}%,ma_da.ilike.%${safeTerm}%`);
    }
    if (projectIdsFromManagers) next = next.in("id", projectIdsFromManagers);
    return next;
  };

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const [pageResult, countResult] = await Promise.all([
    applyProjectFilters(
      supabase.from("du_an").select(select).order("created_at", { ascending: false })
    ).range(from, to),
    applyProjectFilters(
      supabase.from("du_an").select("id", { count: "exact", head: true })
    ),
  ]);
  throwDatabaseError(pageResult.error);
  throwDatabaseError(countResult.error);
  const items = hydrateProjects((pageResult.data ?? []) as unknown as ProjectRow[]);
  return { items, total: countResult.count ?? 0 };
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
    await syncProjectPeople(supabase, projectRow.id, managerIds, memberIds, {
      assumeEmpty: true,
    });
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
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
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

/** `assigneeIds` từ UI có thể là mã nhân viên, cần quy về UUID rồi lấy các công việc tương ứng. */
async function workTaskIdsForAssignees(
  supabase: ApiSupabaseClient,
  assigneeIds: string[] | undefined
): Promise<string[] | undefined> {
  if (!assigneeIds || assigneeIds.length === 0) return undefined;
  const accountIds = await resolveAccountIds(supabase, assigneeIds, "Người phụ trách");
  const { data, error } = await supabase
    .from("cong_viec_phu_trach")
    .select("cong_viec_id")
    .in("tai_khoan_id", accountIds);
  throwDatabaseError(error);
  return uniqueValues((data ?? []).map((row) => row.cong_viec_id as string));
}

export async function listWorkTasks(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters = {},
  options?: { summary?: boolean }
): Promise<WorkTask[]> {
  const taskIdsFromAssignees = await workTaskIdsForAssignees(supabase, filters.assigneeIds);
  if (taskIdsFromAssignees?.length === 0) return [];

  let query = supabase
    .from("cong_viec")
    .select(options?.summary ? WORK_TASK_SUMMARY_SELECT : WORK_TASK_SELECT)
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
  return (data ?? []).map((raw) => mapWorkTaskDirectoryItem(raw));
}

/** Một công việc tối giản — dùng trang chi tiết Task thay vì tải cả directory. */
export async function getWorkTaskDirectoryItem(
  supabase: ApiSupabaseClient,
  id: string
): Promise<WorkTaskDirectoryItem | null> {
  const { data, error } = await supabase
    .from("cong_viec")
    .select(WORK_TASK_DIRECTORY_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? mapWorkTaskDirectoryItem(data) : null;
}

function mapWorkTaskDirectoryItem(raw: unknown): WorkTaskDirectoryItem {
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
}

/**
 * Giống `listWorkTasks` nhưng chỉ tải một trang kết quả (dùng cho trang danh sách
 * dạng bảng có phân trang) thay vì hydrate toàn bộ tập kết quả khớp bộ lọc.
 */
export async function listWorkTasksPage(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters & { page: number; pageSize: number; lite?: boolean }
): Promise<PagedResult<WorkTask>> {
  const taskIdsFromAssignees = await workTaskIdsForAssignees(supabase, filters.assigneeIds);
  if (taskIdsFromAssignees?.length === 0) return { items: [], total: 0 };

  const assigneeAccountId = filters.assigneeId
    ? await resolveAccountId(supabase, filters.assigneeId, "Người phụ trách")
    : undefined;
  const applyWorkTaskFilters = (query: any) => {
    let next = query;
    if (filters.search?.trim()) next = next.ilike("ten_cv", `%${filters.search.trim()}%`);
    if (filters.projectId) next = next.eq("du_an_id", filters.projectId);
    if (taskIdsFromAssignees) next = next.in("id", taskIdsFromAssignees);
    if (assigneeAccountId) next = next.eq("nguoi_phu_trach_id", assigneeAccountId);
    if (filters.priority) next = next.eq("uu_tien", filters.priority);
    if (filters.status) next = next.eq("trang_thai", toDatabaseStatus(filters.status));
    if (filters.overdueOnly) {
      next = next.neq("trang_thai", "done").lt("ngay_hoan_thanh", getAppDateKey());
    }
    return next;
  };

  const select = filters.lite ? WORK_TASK_DASHBOARD_SELECT : WORK_TASK_SELECT;
  const { from, to } = pageRange(filters.page, filters.pageSize);
  const [pageResult, countResult] = await Promise.all([
    applyWorkTaskFilters(
      supabase.from("cong_viec").select(select).order("created_at", { ascending: false })
    ).range(from, to),
    applyWorkTaskFilters(
      supabase.from("cong_viec").select("id", { count: "exact", head: true })
    ),
  ]);
  throwDatabaseError(pageResult.error);
  throwDatabaseError(countResult.error);
  const items = hydrateWorkTasks((pageResult.data ?? []) as unknown as WorkTaskRow[]);
  return { items, total: countResult.count ?? 0 };
}

/** Chỉ id + tên, dùng cho dropdown công việc tiền đề thay vì hydrate toàn bộ bản ghi. */
export async function listWorkTaskOptions(
  supabase: ApiSupabaseClient,
  filters: WorkTaskFilters = {}
): Promise<WorkTaskOption[]> {
  const taskIdsFromAssignees = await workTaskIdsForAssignees(supabase, filters.assigneeIds);
  if (taskIdsFromAssignees?.length === 0) return [];

  let query = supabase
    .from("cong_viec")
    .select("id,ten_cv")
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
  return ((data ?? []) as Array<{ id: string; ten_cv: string }>).map((row) => ({
    id: row.id,
    title: row.ten_cv,
  }));
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

/**
 * Đồng bộ bảng nối người phụ trách; phần tử đầu của `accountIds` là người chính.
 * `assumeEmpty`: entity mới — bỏ SELECT so sánh (tránh +1 RTT trên create).
 */
async function syncAssignments(
  supabase: ApiSupabaseClient,
  table: "cong_viec_phu_trach" | "task_phu_trach" | "truc_nhat_lich_lap_phu_trach" | "truc_nhat_ca_phu_trach",
  ownerColumn: "cong_viec_id" | "task_id" | "lich_lap_id" | "ca_id",
  ownerId: string,
  accountIds: string[],
  options?: { assumeEmpty?: boolean }
): Promise<void> {
  if (!options?.assumeEmpty) {
    const { data: current, error: currentError } = await supabase
      .from(table)
      .select("tai_khoan_id,la_chinh")
      .eq(ownerColumn, ownerId);
    throwDatabaseError(currentError);

    const currentRows = current ?? [];
    const currentIds = currentRows.map((row) => row.tai_khoan_id as string);
    const currentPrimary = currentRows.find((row) => row.la_chinh)?.tai_khoan_id as
      | string
      | undefined;
    const currentSet = new Set(currentIds);
    const sameMembers =
      currentIds.length === accountIds.length &&
      accountIds.every((accountId) => currentSet.has(accountId));
    const samePrimary = (accountIds[0] ?? null) === (currentPrimary ?? null);
    if (sameMembers && samePrimary) return;
  }

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

/** Ghi đè embed người phụ trách sau sync — giữ `xac_nhan_luc` của người còn lại. */
function withSubtaskAssignees(
  row: SubtaskRow,
  assigneeIds: string[],
  accountsById: Map<string, AccountRow>
): SubtaskRow {
  const previousById = new Map(
    (row.task_phu_trach ?? []).map((assignment) => [assignment.tai_khoan_id, assignment])
  );
  return {
    ...row,
    legacy_assignee: accountsById.get(assigneeIds[0]) ?? row.legacy_assignee,
    task_phu_trach: assigneeIds.map((accountId) => ({
      tai_khoan_id: accountId,
      la_chinh: accountId === assigneeIds[0],
      xac_nhan_luc: previousById.get(accountId)?.xac_nhan_luc ?? null,
      tai_khoan: accountsById.get(accountId) ?? null,
    })),
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
      assigneeIds,
      { assumeEmpty: true }
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
  const { data: currentRow, error: currentError } = await supabase
    .from("cong_viec")
    .select("trang_thai")
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(currentError);
  if (!currentRow) return null;
  if (currentRow.trang_thai === "done") {
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
  projectId: string,
  assigneeIds?: string[]
): Promise<ProjectTask[]> {
  const tasks = await listWorkTasks(supabase, { projectId, assigneeIds }, { summary: true });

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
      progress: row.cap_nhat_bo_sung !== undefined || row.ban_giao_noi_dung !== undefined
        ? detailTaskProgressPercent(
          (row.cap_nhat_bo_sung ?? []).flatMap((entry) => typeof entry?.id === "string" ? [entry.id] : []),
          decodeHandover(row.ban_giao_noi_dung, row.ban_giao_link_anh).rows,
        )
        : row.tien_do_thuc_te,
      tags: row.nhan_tag ?? [],
      files: row.tep_dinh_kem ?? [],
      links: row.lien_ket_dinh_kem ?? [],
      images: row.hinh_anh ?? [],
      updates: row.cap_nhat_bo_sung ?? [],
      issues: normalizeSubtaskIssueEntries(row.van_de_giai_phap),
      handover: decodeHandover(row.ban_giao_noi_dung, row.ban_giao_link_anh),
      promptItems: row.prompt_items !== undefined
        ? normalizeSubtaskPromptItems(row.prompt_items)
        : [],
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

  const assigneeAccountId = filters.assigneeId
    ? await resolveAccountId(supabase, filters.assigneeId, "Người phụ trách")
    : undefined;
  const applySubtaskFilters = (query: any) => {
    let next = query;
    if (filters.search?.trim()) next = next.ilike("ten_task", `%${filters.search.trim()}%`);
    if (filters.workTaskId) next = next.eq("cong_viec_id", filters.workTaskId);
    if (workTaskIds) next = next.in("cong_viec_id", workTaskIds);
    if (subtaskIdsFromAssignees) next = next.in("id", subtaskIdsFromAssignees);
    if (assigneeAccountId) next = next.eq("nguoi_phu_trach_id", assigneeAccountId);
    if (filters.testerId) next = next.eq("nguoi_test_id", filters.testerId);
    if (filters.priorities?.length) next = next.in("uu_tien", filters.priorities);
    else if (filters.priority) next = next.eq("uu_tien", filters.priority);
    if (filters.statuses?.length) next = next.in("trang_thai", filters.statuses.map(toDatabaseStatus));
    else if (filters.status) next = next.eq("trang_thai", toDatabaseStatus(filters.status));
    if (filters.overdueOnly) {
      next = next.neq("trang_thai", "done").lt("ngay_ket_thuc", getAppDateKey());
    }
    return next;
  };

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const [pageResult, countResult] = await Promise.all([
    applySubtaskFilters(
      supabase.from("task").select(SUBTASK_LIST_SELECT).order("created_at", { ascending: false })
    ).range(from, to),
    applySubtaskFilters(
      supabase.from("task").select("id", { count: "exact", head: true })
    ),
  ]);
  throwDatabaseError(pageResult.error);
  throwDatabaseError(countResult.error);
  const items = hydrateSubtasks((pageResult.data ?? []) as unknown as SubtaskRow[]);
  return { items, total: countResult.count ?? 0 };
}

export async function getSubtask(
  supabase: ApiSupabaseClient,
  id: string
): Promise<Subtask | null> {
  const detailed = await supabase
    .from("task")
    .select(SUBTASK_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  // Deployment chưa có cột van_de_giai_phap / prompt_items: fallback từng bước.
  if (detailed.error?.code === "42703" || detailed.error?.code === "PGRST204") {
    const withoutIssues = await supabase
      .from("task")
      .select(SUBTASK_DETAIL_SELECT_WITHOUT_ISSUES)
      .eq("id", id)
      .maybeSingle();
    if (!withoutIssues.error && withoutIssues.data) {
      const [subtask] = hydrateSubtasks([withoutIssues.data as unknown as SubtaskRow]);
      return subtask;
    }
    const fallback = await supabase
      .from("task")
      .select(SUBTASK_SELECT)
      .eq("id", id)
      .maybeSingle();
    throwDatabaseError(fallback.error);
    if (!fallback.data) return null;
    const [subtask] = hydrateSubtasks([fallback.data as unknown as SubtaskRow]);
    return subtask;
  }

  throwDatabaseError(detailed.error);
  if (!detailed.data) return null;
  const [subtask] = hydrateSubtasks([detailed.data as unknown as SubtaskRow]);
  return subtask;
}

/** Fetches the task and parent work-task data together for the detail page. */
export async function getSubtaskDetailPageData(
  supabase: ApiSupabaseClient,
  id: string
): Promise<{ subtask: Subtask | null; parentWorkTask: WorkTaskDirectoryItem | null }> {
  const select = (columns: string) =>
    supabase.from("task").select(columns).eq("id", id).maybeSingle();

  let { data, error } = await select(SUBTASK_PAGE_DETAIL_SELECT);

  // Keep compatibility with deployments that have not added all detail columns yet.
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const withoutIssues = await select(SUBTASK_PAGE_DETAIL_SELECT_WITHOUT_ISSUES);
    if (!withoutIssues.error && withoutIssues.data) {
      data = withoutIssues.data;
      error = null;
    } else {
      const fallback = await select(
        `${SUBTASK_SELECT},parent_work_task:cong_viec!task_cong_viec_id_fkey(${WORK_TASK_DIRECTORY_SELECT})`
      );
      data = fallback.data;
      error = fallback.error;
    }
  }

  throwDatabaseError(error);
  if (!data) return { subtask: null, parentWorkTask: null };

  const row = data as unknown as SubtaskRow & { parent_work_task: unknown | null };
  return {
    subtask: hydrateSubtasks([row])[0],
    parentWorkTask: row.parent_work_task
      ? mapWorkTaskDirectoryItem(row.parent_work_task)
      : null,
  };
}

export async function updateSubtaskPromptItems(
  supabase: ApiSupabaseClient,
  id: string,
  items: SubtaskPromptItem[]
): Promise<SubtaskPromptItem[] | null> {
  const existing = await supabase
    .from("task")
    .select("prompt_items")
    .eq("id", id)
    .maybeSingle();
  if (existing.error?.code === "42703" || existing.error?.code === "PGRST204") {
    throw new ApiException(
      "Cơ sở dữ liệu chưa được cập nhật cho tính năng Prompt.",
      503
    );
  }
  throwDatabaseError(existing.error);
  if (!existing.data) return null;

  const existingItems = new Map(
    normalizeSubtaskPromptItems(existing.data.prompt_items).map((item) => [item.id, item])
  );
  const timestampedItems = items.map((item) => {
    const previous = existingItems.get(item.id);
    const statusChanged = Boolean(previous && previous.status !== item.status);
    return {
      ...item,
      ...(previous
        ? (previous.createdAt ? { createdAt: previous.createdAt } : {})
        : { createdAt: item.createdAt ?? new Date().toISOString() }),
      statusHistory: [
        ...(previous?.statusHistory ?? []),
        ...(statusChanged
          ? [{ from: previous!.status, to: item.status, at: new Date().toISOString() }]
          : []),
      ],
    };
  });
  const { data, error } = await supabase
    .from("task")
    .update({ prompt_items: timestampedItems })
    .eq("id", id)
    .select("prompt_items")
    .maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    throw new ApiException(
      "Cơ sở dữ liệu chưa được cập nhật cho tính năng Prompt.",
      503
    );
  }
  throwDatabaseError(error);
  if (!data) return null;
  return normalizeSubtaskPromptItems(data.prompt_items);
}

export async function listSubtaskTimeRecords(
  supabase: ApiSupabaseClient,
  id: string
): Promise<SubtaskTimeRecord[]> {
  const { data, error } = await supabase
    .from("task")
    .select("time_records")
    .eq("id", id)
    .maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204") return [];
  throwDatabaseError(error);
  if (!data) return [];
  return normalizeSubtaskTimeRecords(data.time_records);
}

export async function appendSubtaskTimeRecord(
  supabase: ApiSupabaseClient,
  id: string,
  type: SubtaskTimeRecord["type"],
  actorId: string
): Promise<SubtaskTimeRecord[] | null> {
  const { data, error } = await supabase.rpc("append_task_time_record", {
    p_task_id: id,
    p_type: type,
    p_actor_id: actorId,
  });
  if (error?.code === "42883" || error?.code === "PGRST202" || error?.code === "42703") {
    throw new ApiException(
      "Cơ sở dữ liệu chưa được cập nhật cho tính năng ghi nhận thời gian.",
      503
    );
  }
  if (error?.code === "22023") {
    throw new ApiException("Mốc thời gian không hợp lệ theo trạng thái hiện tại.", 409);
  }
  throwDatabaseError(error);
  if (data === null) return null;
  return normalizeSubtaskTimeRecords(data);
}

function normalizeSubtaskTimeRecords(value: unknown): SubtaskTimeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      (entry.type !== "start" && entry.type !== "pause" && entry.type !== "end") ||
      typeof entry.at !== "string"
    ) return [];
    return [{
      id: entry.id,
      type: entry.type,
      at: entry.at,
      ...(typeof entry.actorId === "string" ? { actorId: entry.actorId } : {}),
    }];
  });
}

export async function updateSubtaskHandover(
  supabase: ApiSupabaseClient,
  id: string,
  handover: SubtaskHandover
): Promise<SubtaskHandover | null> {
  const current = await supabase
    .from("task")
    .select("cap_nhat_bo_sung")
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(current.error);
  const updateIds = Array.isArray(current.data?.cap_nhat_bo_sung)
    ? current.data.cap_nhat_bo_sung.flatMap((entry) => (
      entry && typeof entry === "object" && typeof entry.id === "string" ? [entry.id] : []
    ))
    : [];
  const progress = detailTaskProgressPercent(updateIds, handover.rows);
  let { data, error } = await supabase
    .from("task")
    .update({
      ban_giao_noi_dung: encodeHandoverContent(handover),
      ban_giao_link_anh: handover.imageUrl,
      tien_do_thuc_te: progress,
    })
    .eq("id", id)
    .select("ban_giao_noi_dung,ban_giao_link_anh")
    .maybeSingle();
  if (error?.code === "23514") {
    ({ data, error } = await supabase
      .from("task")
      .update({
        ban_giao_noi_dung: encodeHandoverContent(handover),
        ban_giao_link_anh: handover.imageUrl,
      })
      .eq("id", id)
      .select("ban_giao_noi_dung,ban_giao_link_anh")
      .maybeSingle());
  }

  if (error?.code === "42703" || error?.code === "PGRST204") {
    throw new ApiException("Cơ sở dữ liệu chưa được cập nhật cho mục Bàn giao.", 503);
  }
  throwDatabaseError(error);
  if (!data) return null;
  return decodeHandover(data.ban_giao_noi_dung, data.ban_giao_link_anh);
}

function normalizeSubtaskPromptItems(value: unknown): SubtaskPromptItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.content !== "string") return [];
    const imageUrls: string[] = [];
    if (Array.isArray(entry.imageUrls)) {
      for (const url of entry.imageUrls) {
        if (typeof url === "string" && url.trim()) imageUrls.push(url.trim());
      }
    } else if (typeof entry.imageUrl === "string" && entry.imageUrl.trim()) {
      imageUrls.push(entry.imageUrl.trim());
    }
    return [{
      id: entry.id,
      content: entry.content,
      ...(typeof entry.createdAt === "string" ? { createdAt: entry.createdAt } : {}),
      statusHistory: Array.isArray(entry.statusHistory)
        ? entry.statusHistory.flatMap((change) => {
            if (!change || typeof change !== "object" || Array.isArray(change)) return [];
            const record = change as Record<string, unknown>;
            const validStatuses = ["unprocessed", "processed", "completed"];
            if (
              typeof record.at !== "string" ||
              !validStatuses.includes(String(record.from)) ||
              !validStatuses.includes(String(record.to))
            ) return [];
            return [{
              from: record.from as SubtaskPromptItem["status"],
              to: record.to as SubtaskPromptItem["status"],
              at: record.at,
            }];
          })
        : [],
      imageUrls: imageUrls.slice(0, 10),
      status: entry.status === "processed" || entry.status === "completed"
        ? entry.status as "processed" | "completed"
        : "unprocessed" as const,
    }];
  });
}

function normalizeSubtaskIssueEntries(value: unknown): SubtaskIssueEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const problem = typeof entry.problem === "string" ? entry.problem.trim() : "";
    const solution = typeof entry.solution === "string" ? entry.solution.trim() : "";
    if (!problem && !solution) return [];
    const id =
      typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : crypto.randomUUID();
    return [{ id, problem, solution }];
  });
}

export async function getSubtaskPromptItems(
  supabase: ApiSupabaseClient,
  id: string
): Promise<SubtaskPromptItem[]> {
  const { data, error } = await supabase
    .from("task")
    .select("prompt_items")
    .eq("id", id)
    .maybeSingle();
  // Giữ trang chi tiết hoạt động trong lúc deployment chưa chạy migration mới.
  if (error?.code === "42703" || error?.code === "PGRST204") return [];
  throwDatabaseError(error);
  return data ? normalizeSubtaskPromptItems(data.prompt_items) : [];
}

function subtaskPayload(
  input: SubtaskInput,
  primaryAccountId: string,
  testerAccountId: string | null,
  progress: number,
  status: TaskStatus,
  options?: { includeIssues?: boolean }
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
    ...(options?.includeIssues === false ? {} : { van_de_giai_phap: input.issues }),
    cong_viec_id: input.workTaskId,
  };
}

function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export async function createSubtask(
  supabase: ApiSupabaseClient,
  input: SubtaskInput,
  creatorAccountId: string
): Promise<Subtask> {
  const { data: parentRow, error: parentError } = await supabase
    .from("cong_viec")
    .select("id")
    .eq("id", input.workTaskId)
    .maybeSingle();
  throwDatabaseError(parentError);
  if (!parentRow) throw new ApiException("Không tìm thấy công việc.", 404);

  const [{ ids: assigneeIds, accountsById }, testerAccountId] = await Promise.all([
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
    .select(SUBTASK_DETAIL_SELECT)
    .single();

  let insertData: unknown = data;
  let insertError = error;
  let issuesFromInput = false;
  if (isMissingColumnError(insertError)) {
    const retry = await supabase
      .from("task")
      .insert({
        ...subtaskPayload(input, assigneeIds[0], testerAccountId, 0, "todo", {
          includeIssues: false,
        }),
        nguoi_tao_id: creatorAccountId,
      })
      .select(SUBTASK_DETAIL_SELECT_WITHOUT_ISSUES)
      .single();
    insertData = retry.data;
    insertError = retry.error;
    issuesFromInput = true;
  }

  throwDatabaseError(insertError);
  if (!insertData) throw new ApiException("Supabase không trả về task vừa tạo.", 500);
  let subtaskRow = insertData as SubtaskRow;
  if (issuesFromInput) {
    subtaskRow = { ...subtaskRow, van_de_giai_phap: input.issues };
  }

  const subtaskId = subtaskRow.id;
  try {
    await syncAssignments(
      supabase,
      "task_phu_trach",
      "task_id",
      subtaskId,
      assigneeIds,
      { assumeEmpty: true }
    );
  } catch (syncError) {
    // Xem chú thích tương ứng trong createWorkTask() — compensating delete, không
    // phải RPC transaction thật.
    await supabase.from("task").delete().eq("id", subtaskId);
    throw syncError;
  }

  const [subtask] = hydrateSubtasks([
    withSubtaskAssignees(subtaskRow, assigneeIds, accountsById),
  ]);
  return subtask;
}

/** Ghi danh sách lần bổ sung và tính lại tiến độ theo trạng thái nghiệm thu. */
export async function updateSubtaskUpdates(
  supabase: ApiSupabaseClient,
  id: string,
  updates: SubtaskUpdateEntry[]
): Promise<Subtask | null> {
  const current = await supabase
    .from("task")
    .select("ban_giao_noi_dung,ban_giao_link_anh")
    .eq("id", id)
    .maybeSingle();
  const rows = current.error ? {} : decodeHandover(current.data?.ban_giao_noi_dung, current.data?.ban_giao_link_anh).rows;
  const progress = detailTaskProgressPercent(updates.map((entry) => entry.id), rows);
  let { data, error } = await supabase
    .from("task")
    .update({ cap_nhat_bo_sung: updates, tien_do_thuc_te: progress })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.code === "23514") {
    ({ data, error } = await supabase
      .from("task")
      .update({ cap_nhat_bo_sung: updates })
      .eq("id", id)
      .select("id")
      .maybeSingle());
  }
  throwDatabaseError(error);
  if (!data) return null;
  return getSubtask(supabase, id);
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

  const [{ ids: assigneeIds, accountsById }, testerAccountId] = await Promise.all([
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
    .select(SUBTASK_DETAIL_SELECT)
    .maybeSingle();

  let updateData: unknown = data;
  let updateError = error;
  let issuesFromInput = false;
  if (isMissingColumnError(updateError)) {
    const retry = await supabase
      .from("task")
      .update(
        subtaskPayload(
          input,
          assigneeIds[0],
          testerAccountId,
          nextProgress,
          nextStatus,
          { includeIssues: false }
        )
      )
      .eq("id", id)
      .select(SUBTASK_DETAIL_SELECT_WITHOUT_ISSUES)
      .maybeSingle();
    updateData = retry.data;
    updateError = retry.error;
    issuesFromInput = true;
  }

  throwDatabaseError(updateError);
  if (!updateData) return null;

  await syncAssignments(supabase, "task_phu_trach", "task_id", id, assigneeIds);

  let subtaskRow = updateData as SubtaskRow;
  if (issuesFromInput) {
    subtaskRow = { ...subtaskRow, van_de_giai_phap: input.issues };
  }

  const [subtask] = hydrateSubtasks([
    withSubtaskAssignees(subtaskRow, assigneeIds, accountsById),
  ]);
  return subtask;
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
    assigneeId: typeof row.chi_tiet?.nguoi_phu_trach_id === "string" ? row.chi_tiet.nguoi_phu_trach_id : undefined,
    assigneeName: typeof row.chi_tiet?.nguoi_phu_trach_ten === "string" ? row.chi_tiet.nguoi_phu_trach_ten : undefined,
    createdAt: row.created_at,
    editable: row.loai === "note",
  }));
}

export async function createSubtaskActivityNote(
  supabase: ApiSupabaseClient,
  taskId: string,
  result: string,
  content: string,
  assigneeId?: string | null
): Promise<TaskActivityEvent> {
  const first = await supabase.rpc("append_task_activity_note", {
    p_task_id: taskId,
    p_result: result,
    p_content: content,
    p_nguoi_phu_trach_id: assigneeId || null,
  });
  let noteId = first.data;
  if (first.error && isSchemaCacheError(first.error) && assigneeId) {
    // DB chưa chạy migration người phụ trách: lưu ghi chú, bỏ qua người phụ trách.
    console.warn("Activity note assignee param missing, falling back:", first.error.message);
    const retry = await supabase.rpc("append_task_activity_note", {
      p_task_id: taskId,
      p_result: result,
      p_content: content,
    });
    throwDatabaseError(retry.error);
    noteId = retry.data;
  } else {
    throwDatabaseError(first.error);
  }
  const { data, error } = await supabase
    .from("task_hoat_dong")
    .select(TASK_ACTIVITY_SELECT)
    .eq("id", noteId)
    .single();
  throwDatabaseError(error);
  return hydrateTaskActivity([data as unknown as TaskActivityRow])[0];
}

export async function updateSubtaskActivityNote(
  supabase: ApiSupabaseClient,
  taskId: string,
  noteId: string,
  result: string,
  content: string,
  assigneeId?: string | null
): Promise<TaskActivityEvent | null> {
  const first = await supabase.rpc("update_task_activity_note", {
    p_task_id: taskId,
    p_note_id: noteId,
    p_result: result,
    p_content: content,
    p_nguoi_phu_trach_id: assigneeId || null,
  });
  let updatedId = first.data;
  if (first.error && isSchemaCacheError(first.error) && assigneeId) {
    console.warn("Activity note assignee param missing, falling back:", first.error.message);
    const retry = await supabase.rpc("update_task_activity_note", {
      p_task_id: taskId,
      p_note_id: noteId,
      p_result: result,
      p_content: content,
    });
    throwDatabaseError(retry.error);
    updatedId = retry.data;
  } else {
    throwDatabaseError(first.error);
  }
  if (!updatedId) return null;
  const { data, error } = await supabase
    .from("task_hoat_dong")
    .select(TASK_ACTIVITY_SELECT)
    .eq("id", updatedId)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? hydrateTaskActivity([data as unknown as TaskActivityRow])[0] : null;
}

export async function deleteSubtaskActivityNote(
  supabase: ApiSupabaseClient,
  taskId: string,
  noteId: string
): Promise<boolean> {
  const { data: deleted, error: rpcError } = await supabase.rpc("delete_task_activity_note", {
    p_task_id: taskId,
    p_note_id: noteId,
  });
  if (rpcError && isSchemaCacheError(rpcError)) {
    throw new ApiException("Chức năng xóa ghi chú chưa được cập nhật trên database.", 400);
  }
  throwDatabaseError(rpcError);
  return Boolean(deleted);
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

// ---- Trực nhật ----
// Cơ chế "lịch ảo + chốt cụ thể": truc_nhat_lich_lap là quy tắc lặp theo thứ
// trong tuần; truc_nhat_ca là bản ghi đã "chốt" cho 1 ngày cụ thể. Ngày nào
// chưa chốt sẽ được tính "ảo" từ quy tắc lặp khi đọc theo khoảng ngày, và chỉ
// được ghi xuống DB khi có thao tác ghi (chỉnh sửa riêng ngày đó, hoặc mở chi
// tiết 1 ngày có quy tắc áp dụng, hoặc tick 1 đầu việc).

/** Số ngày mặc định sinh trước lịch trực khi tạo/sửa 1 quy tắc lặp. */
const DUTY_AUTO_GENERATE_DAYS = 56;

const DUTY_TEMPLATE_SELECT = "id,ten,mo_ta,thu_tu,dang_hoat_dong,created_at,updated_at";
const DUTY_RULE_SELECT =
  "id,thu_trong_tuan,ngay_bat_dau,ngay_ket_thuc,ghi_chu,dang_hoat_dong,created_at,updated_at," +
  `truc_nhat_lich_lap_phu_trach(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT}))`;
const DUTY_SHIFT_SELECT =
  "id,ngay_truc,nguon,lich_lap_id,trang_thai,ghi_chu,created_at,updated_at," +
  `truc_nhat_ca_phu_trach(tai_khoan_id,la_chinh,tai_khoan(${ACCOUNT_SELECT})),` +
  "truc_nhat_ca_dau_viec(id,dau_viec_mau_id,ten,thu_tu,hoan_thanh,hoan_thanh_luc,hoan_thanh_boi," +
  `nguoi_hoan_thanh:tai_khoan!hoan_thanh_boi(${ACCOUNT_SELECT}))`;
const DUTY_CHECKLIST_ITEM_SELECT =
  "id,dau_viec_mau_id,ten,thu_tu,hoan_thanh,hoan_thanh_luc,hoan_thanh_boi," +
  `nguoi_hoan_thanh:tai_khoan!hoan_thanh_boi(${ACCOUNT_SELECT})`;

interface DutyTemplateRow {
  id: string;
  ten: string;
  mo_ta: string | null;
  thu_tu: number;
  dang_hoat_dong: boolean;
  created_at: string;
  updated_at: string;
}

interface DutyAssignmentEmbedRow {
  tai_khoan_id: string;
  la_chinh: boolean;
  tai_khoan: AccountRow | null;
}

interface DutyRuleRow {
  id: string;
  thu_trong_tuan: number;
  ngay_bat_dau: string;
  ngay_ket_thuc: string | null;
  ghi_chu: string | null;
  dang_hoat_dong: boolean;
  created_at: string;
  updated_at: string;
  truc_nhat_lich_lap_phu_trach: DutyAssignmentEmbedRow[] | null;
}

interface DutyChecklistItemRow {
  id: string;
  dau_viec_mau_id: string | null;
  ten: string;
  thu_tu: number;
  hoan_thanh: boolean;
  hoan_thanh_luc: string | null;
  hoan_thanh_boi: string | null;
  nguoi_hoan_thanh: AccountRow | null;
}

interface DutyShiftRow {
  id: string;
  ngay_truc: string;
  nguon: DutySource;
  lich_lap_id: string | null;
  trang_thai: DutyShiftStatus;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
  truc_nhat_ca_phu_trach: DutyAssignmentEmbedRow[] | null;
  truc_nhat_ca_dau_viec: DutyChecklistItemRow[] | null;
}

/** Quy tắc lặp ở dạng "thô" (id tài khoản thật) dùng nội bộ để chốt lịch. */
interface DutyRuleRawRow {
  id: string;
  thu_trong_tuan: number;
  ngay_bat_dau: string;
  ngay_ket_thuc: string | null;
  assigneeIds: string[];
}

function toDutyChecklistTemplate(row: DutyTemplateRow): DutyChecklistTemplate {
  return {
    id: row.id,
    name: row.ten,
    description: row.mo_ta ?? undefined,
    order: row.thu_tu,
    active: row.dang_hoat_dong,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDutyAssignees(rows: DutyAssignmentEmbedRow[] | null): ProjectMember[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
    .map((row) => row.tai_khoan)
    .filter((account): account is AccountRow => Boolean(account))
    .map(toProjectMember);
}

function toDutyRecurringRule(row: DutyRuleRow): DutyRecurringRule {
  return {
    id: row.id,
    weekday: row.thu_trong_tuan,
    assignees: toDutyAssignees(row.truc_nhat_lich_lap_phu_trach),
    startDate: row.ngay_bat_dau,
    endDate: row.ngay_ket_thuc ?? undefined,
    note: row.ghi_chu ?? undefined,
    active: row.dang_hoat_dong,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDutyChecklistItem(row: DutyChecklistItemRow): DutyChecklistItem {
  return {
    id: row.id,
    templateId: row.dau_viec_mau_id ?? undefined,
    name: row.ten,
    order: row.thu_tu,
    done: row.hoan_thanh,
    doneAt: row.hoan_thanh_luc ?? undefined,
    doneBy: row.nguoi_hoan_thanh ? toProjectMember(row.nguoi_hoan_thanh) : undefined,
  };
}

function toDutyShift(row: DutyShiftRow): DutyShift {
  return {
    id: row.id,
    date: row.ngay_truc,
    status: row.trang_thai,
    source: row.nguon,
    ruleId: row.lich_lap_id ?? undefined,
    assignees: toDutyAssignees(row.truc_nhat_ca_phu_trach),
    note: row.ghi_chu ?? undefined,
    checklist: (row.truc_nhat_ca_dau_viec ?? [])
      .slice()
      .sort((a, b) => a.thu_tu - b.thu_tu)
      .map(toDutyChecklistItem),
  };
}

function deriveDutyShiftStatus(doneStates: readonly boolean[]): DutyShiftStatus {
  if (doneStates.length === 0 || !doneStates.some(Boolean)) return "chua_thuc_hien";
  return doneStates.every(Boolean) ? "hoan_thanh" : "dang_thuc_hien";
}

async function syncDutyShiftStatus(
  supabase: ApiSupabaseClient,
  caId: string,
  doneStates: readonly boolean[]
): Promise<DutyShiftStatus> {
  const status = deriveDutyShiftStatus(doneStates);

  const { error } = await supabase
    .from("truc_nhat_ca")
    .update({ trang_thai: status })
    .eq("id", caId);
  throwDatabaseError(error);
  return status;
}

function emptyDutyShift(date: string): DutyShift {
  return { id: null, date, status: "chua_thuc_hien", source: "thu_cong", assignees: [], checklist: [] };
}

function virtualDutyShiftFromRule(
  date: string,
  rule: DutyRuleRawRow,
  accountsById: Map<string, AccountRow>,
  templates: DutyChecklistTemplate[]
): DutyShift {
  return {
    id: null,
    date,
    status: "chua_thuc_hien",
    source: "lap_lich",
    ruleId: rule.id,
    assignees: rule.assigneeIds
      .map((accountId) => accountsById.get(accountId))
      .filter((account): account is AccountRow => Boolean(account))
      .map(toProjectMember),
    checklist: templates.map((template) => ({
      id: template.id,
      templateId: template.id,
      name: template.name,
      order: template.order,
      done: false,
    })),
  };
}

/** YYYY-MM-DD → 1 (Thứ 2) .. 7 (Chủ nhật), tính theo UTC vì date-key không mang giờ. */
function isoWeekday(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function enumerateDateKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let cursor = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (cursor <= end) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return keys;
}

function findRuleForDate(rules: DutyRuleRawRow[], dateKey: string): DutyRuleRawRow | undefined {
  const weekday = isoWeekday(dateKey);
  return rules.find(
    (rule) =>
      rule.thu_trong_tuan === weekday &&
      rule.ngay_bat_dau <= dateKey &&
      (!rule.ngay_ket_thuc || rule.ngay_ket_thuc >= dateKey)
  );
}

/** Quy tắc lặp đang hoạt động, có hiệu lực chồng lấn khoảng [from, to]. */
async function listActiveDutyRulesRaw(
  supabase: ApiSupabaseClient,
  from: string,
  to: string
): Promise<DutyRuleRawRow[]> {
  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .select("id,thu_trong_tuan,ngay_bat_dau,ngay_ket_thuc,truc_nhat_lich_lap_phu_trach(tai_khoan_id,la_chinh)")
    .eq("dang_hoat_dong", true)
    .lte("ngay_bat_dau", to)
    .or(`ngay_ket_thuc.is.null,ngay_ket_thuc.gte.${from}`);
  throwDatabaseError(error);

  return ((data ?? []) as unknown as Array<{
    id: string;
    thu_trong_tuan: number;
    ngay_bat_dau: string;
    ngay_ket_thuc: string | null;
    truc_nhat_lich_lap_phu_trach: { tai_khoan_id: string; la_chinh: boolean }[] | null;
  }>).map((row) => ({
    id: row.id,
    thu_trong_tuan: row.thu_trong_tuan,
    ngay_bat_dau: row.ngay_bat_dau,
    ngay_ket_thuc: row.ngay_ket_thuc,
    assigneeIds: (row.truc_nhat_lich_lap_phu_trach ?? [])
      .slice()
      .sort((a, b) => Number(b.la_chinh) - Number(a.la_chinh))
      .map((assignment) => assignment.tai_khoan_id),
  }));
}

async function copyChecklistTemplatesToShift(
  supabase: ApiSupabaseClient,
  caId: string,
  templates: DutyChecklistTemplate[]
): Promise<void> {
  if (templates.length === 0) return;
  const { error } = await supabase.from("truc_nhat_ca_dau_viec").insert(
    templates.map((template) => ({
      ca_id: caId,
      dau_viec_mau_id: template.id,
      ten: template.name,
      thu_tu: template.order,
    }))
  );
  throwDatabaseError(error);
}

/**
 * Bổ sung các đầu việc mẫu đang hoạt động được tạo sau khi ca đã được chốt.
 * Các mục đã có (kể cả đã hoàn thành) được giữ nguyên để không mất lịch sử.
 */
async function syncMissingChecklistTemplatesToShift(
  supabase: ApiSupabaseClient,
  caId: string,
  checklist: DutyChecklistItemRow[] | null
): Promise<boolean> {
  const templates = await listDutyChecklistTemplates(supabase, true);
  const existingTemplateIds = new Set(
    (checklist ?? [])
      .map((item) => item.dau_viec_mau_id)
      .filter((templateId): templateId is string => Boolean(templateId))
  );
  const missingTemplates = templates.filter((template) => !existingTemplateIds.has(template.id));
  if (missingTemplates.length === 0) return false;

  await copyChecklistTemplatesToShift(supabase, caId, missingTemplates);
  return true;
}

/**
 * Đồng bộ checklist của những ca từ hôm nay trở đi với cấu hình đầu việc hiện tại.
 * Mục đã hoàn thành được giữ làm lịch sử; mục chưa hoàn thành sẽ nhận tên/thứ tự
 * mới, được thêm khi có mẫu mới, hoặc bị bỏ khi mẫu đã tắt/xóa.
 */
async function syncChecklistTemplatesToUpcomingShifts(supabase: ApiSupabaseClient): Promise<void> {
  const [{ data: shifts, error: shiftsError }, templates] = await Promise.all([
    supabase.from("truc_nhat_ca").select("id").gte("ngay_truc", getAppDateKey()),
    listDutyChecklistTemplates(supabase, true),
  ]);
  throwDatabaseError(shiftsError);

  const shiftIds = (shifts ?? []).map((shift) => shift.id as string);
  if (shiftIds.length === 0) return;

  const { data: checklist, error: checklistError } = await supabase
    .from("truc_nhat_ca_dau_viec")
    .select("ca_id,dau_viec_mau_id")
    .in("ca_id", shiftIds);
  throwDatabaseError(checklistError);

  const activeTemplateIds = new Set(templates.map((template) => template.id));
  const existingTemplateKeys = new Set(
    (checklist ?? [])
      .filter((item) => item.dau_viec_mau_id)
      .map((item) => `${item.ca_id as string}:${item.dau_viec_mau_id as string}`)
  );
  const newChecklistRows = shiftIds.flatMap((caId) =>
    templates
      .filter((template) => !existingTemplateKeys.has(`${caId}:${template.id}`))
      .map((template) => ({
        ca_id: caId,
        dau_viec_mau_id: template.id,
        ten: template.name,
        thu_tu: template.order,
      }))
  );
  if (newChecklistRows.length > 0) {
    const { error } = await supabase.from("truc_nhat_ca_dau_viec").insert(newChecklistRows);
    throwDatabaseError(error);
  }

  const existingTemplateIds = [...new Set(
    (checklist ?? [])
      .map((item) => item.dau_viec_mau_id)
      .filter((templateId): templateId is string => Boolean(templateId))
  )];
  const inactiveTemplateIds = existingTemplateIds.filter((templateId) => !activeTemplateIds.has(templateId));
  if (inactiveTemplateIds.length > 0) {
    const { error } = await supabase
      .from("truc_nhat_ca_dau_viec")
      .delete()
      .in("ca_id", shiftIds)
      .in("dau_viec_mau_id", inactiveTemplateIds)
      .eq("hoan_thanh", false);
    throwDatabaseError(error);
  }

  for (const template of templates) {
    const { error } = await supabase
      .from("truc_nhat_ca_dau_viec")
      .update({ ten: template.name, thu_tu: template.order })
      .in("ca_id", shiftIds)
      .eq("dau_viec_mau_id", template.id)
      .eq("hoan_thanh", false);
    throwDatabaseError(error);
  }

  const { data: syncedChecklist, error: syncedChecklistError } = await supabase
    .from("truc_nhat_ca_dau_viec")
    .select("ca_id,hoan_thanh")
    .in("ca_id", shiftIds);
  throwDatabaseError(syncedChecklistError);
  const doneStatesByShift = new Map<string, boolean[]>();
  for (const caId of shiftIds) doneStatesByShift.set(caId, []);
  for (const item of syncedChecklist ?? []) {
    const caId = item.ca_id as string;
    doneStatesByShift.get(caId)?.push(item.hoan_thanh as boolean);
  }
  const shiftIdsByStatus = new Map<DutyShiftStatus, string[]>();
  for (const [caId, doneStates] of doneStatesByShift) {
    const status = deriveDutyShiftStatus(doneStates);
    const ids = shiftIdsByStatus.get(status) ?? [];
    ids.push(caId);
    shiftIdsByStatus.set(status, ids);
  }
  for (const [status, ids] of shiftIdsByStatus) {
    const { error } = await supabase.from("truc_nhat_ca").update({ trang_thai: status }).in("id", ids);
    throwDatabaseError(error);
  }
}

/** Chốt các ngày trong `dateKeys` chưa có `truc_nhat_ca` nhưng có quy tắc lặp áp dụng. */
async function materializeMissingShifts(
  supabase: ApiSupabaseClient,
  dateKeys: string[],
  rules: DutyRuleRawRow[],
  templates: DutyChecklistTemplate[]
): Promise<void> {
  const toCreate = dateKeys
    .map((date) => ({ date, rule: findRuleForDate(rules, date) }))
    .filter((entry): entry is { date: string; rule: DutyRuleRawRow } => Boolean(entry.rule));
  if (toCreate.length === 0) return;

  const { data, error } = await supabase
    .from("truc_nhat_ca")
    .insert(
      toCreate.map(({ date, rule }) => ({
        ngay_truc: date,
        nguon: "lap_lich",
        lich_lap_id: rule.id,
      }))
    )
    .select("id,ngay_truc");
  throwDatabaseError(error);

  const createdIdByDate = new Map(
    ((data ?? []) as { id: string; ngay_truc: string }[]).map((row) => [row.ngay_truc, row.id])
  );

  const phuTrachRows: { ca_id: string; tai_khoan_id: string; la_chinh: boolean }[] = [];
  const checklistRows: { ca_id: string; dau_viec_mau_id: string; ten: string; thu_tu: number }[] = [];
  for (const { date, rule } of toCreate) {
    const caId = createdIdByDate.get(date);
    if (!caId) continue;
    rule.assigneeIds.forEach((accountId, index) => {
      phuTrachRows.push({ ca_id: caId, tai_khoan_id: accountId, la_chinh: index === 0 });
    });
    for (const template of templates) {
      checklistRows.push({ ca_id: caId, dau_viec_mau_id: template.id, ten: template.name, thu_tu: template.order });
    }
  }

  if (phuTrachRows.length > 0) {
    const { error: assignError } = await supabase.from("truc_nhat_ca_phu_trach").insert(phuTrachRows);
    throwDatabaseError(assignError);
  }
  if (checklistRows.length > 0) {
    const { error: checklistError } = await supabase.from("truc_nhat_ca_dau_viec").insert(checklistRows);
    throwDatabaseError(checklistError);
  }
}

async function generateShiftsForRules(
  supabase: ApiSupabaseClient,
  rules: DutyRuleRawRow[],
  from: string,
  to: string
): Promise<void> {
  if (rules.length === 0 || to < from) return;

  const { data: existing, error } = await supabase
    .from("truc_nhat_ca")
    .select("ngay_truc")
    .gte("ngay_truc", from)
    .lte("ngay_truc", to);
  throwDatabaseError(error);

  const existingDates = new Set((existing ?? []).map((row) => row.ngay_truc as string));
  const missingDates = enumerateDateKeys(from, to).filter((date) => !existingDates.has(date));
  if (missingDates.length === 0) return;

  const templates = await listDutyChecklistTemplates(supabase, true);
  await materializeMissingShifts(supabase, missingDates, rules, templates);
}

/** Sinh lịch trực từ 1 quy tắc lặp tới ngày `toDate` (bỏ qua ngày đã chốt). */
export async function generateDutyShiftsForRule(
  supabase: ApiSupabaseClient,
  ruleId: string,
  toDate: string
): Promise<void> {
  const from = getAppDateKey();
  const rules = await listActiveDutyRulesRaw(supabase, from, toDate);
  const rule = rules.find((item) => item.id === ruleId);
  if (!rule) return;
  await generateShiftsForRules(supabase, [rule], from, toDate);
}

/** Đồng bộ người trực cho các ca chưa bị chỉnh thủ công, đã sinh từ quy tắc lặp. */
async function syncUpcomingGeneratedShiftAssignees(
  supabase: ApiSupabaseClient,
  ruleId: string,
  input: DutyRecurringRuleInput,
  assigneeIds: string[]
): Promise<void> {
  const from = getAppDateKey() > input.startDate ? getAppDateKey() : input.startDate;
  if (input.endDate && input.endDate < from) return;

  let query = supabase
    .from("truc_nhat_ca")
    .select("id,ngay_truc")
    .eq("lich_lap_id", ruleId)
    .eq("nguon", "lap_lich")
    .gte("ngay_truc", from);
  if (input.endDate) query = query.lte("ngay_truc", input.endDate);
  const { data: shifts, error } = await query;
  throwDatabaseError(error);

  const matchingShiftIds = (shifts ?? [])
    .filter((shift) => isoWeekday(shift.ngay_truc as string) === input.weekday)
    .map((shift) => shift.id as string);
  for (const shiftId of matchingShiftIds) {
    await syncAssignments(supabase, "truc_nhat_ca_phu_trach", "ca_id", shiftId, assigneeIds);
  }
}

/** Sinh lịch trực cho tất cả quy tắc đang hoạt động tới ngày `toDate`. */
export async function generateDutySchedule(supabase: ApiSupabaseClient, toDate: string): Promise<void> {
  const from = getAppDateKey();
  const rules = await listActiveDutyRulesRaw(supabase, from, toDate);
  await generateShiftsForRules(supabase, rules, from, toDate);
}

function defaultDutyGenerateToDate(ruleEndDate?: string): string {
  const from = new Date(`${getAppDateKey()}T00:00:00Z`).getTime();
  const defaultTo = new Date(from + DUTY_AUTO_GENERATE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return ruleEndDate && ruleEndDate < defaultTo ? ruleEndDate : defaultTo;
}

export async function listDutyChecklistTemplates(
  supabase: ApiSupabaseClient,
  activeOnly = false
): Promise<DutyChecklistTemplate[]> {
  let query = supabase.from("truc_nhat_dau_viec_mau").select(DUTY_TEMPLATE_SELECT).order("thu_tu");
  if (activeOnly) query = query.eq("dang_hoat_dong", true);
  const { data, error } = await query;
  throwDatabaseError(error);
  return ((data ?? []) as DutyTemplateRow[]).map(toDutyChecklistTemplate);
}

export async function createDutyChecklistTemplate(
  supabase: ApiSupabaseClient,
  input: DutyChecklistTemplateInput
): Promise<DutyChecklistTemplate> {
  const { data, error } = await supabase
    .from("truc_nhat_dau_viec_mau")
    .insert({
      ten: input.name,
      mo_ta: input.description ?? null,
      thu_tu: input.order,
      dang_hoat_dong: input.active,
    })
    .select(DUTY_TEMPLATE_SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về đầu việc mẫu vừa tạo.", 500);
  await syncChecklistTemplatesToUpcomingShifts(supabase);
  return toDutyChecklistTemplate(data as DutyTemplateRow);
}

export async function updateDutyChecklistTemplate(
  supabase: ApiSupabaseClient,
  id: string,
  input: DutyChecklistTemplateInput
): Promise<DutyChecklistTemplate | null> {
  const { data, error } = await supabase
    .from("truc_nhat_dau_viec_mau")
    .update({
      ten: input.name,
      mo_ta: input.description ?? null,
      thu_tu: input.order,
      dang_hoat_dong: input.active,
    })
    .eq("id", id)
    .select(DUTY_TEMPLATE_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (data) await syncChecklistTemplatesToUpcomingShifts(supabase);
  return data ? toDutyChecklistTemplate(data as DutyTemplateRow) : null;
}

export async function deleteDutyChecklistTemplate(supabase: ApiSupabaseClient, id: string): Promise<boolean> {
  // Xóa các mục chưa hoàn thành trước, vì sau khi xóa mẫu khóa ngoại sẽ thành null
  // và không còn biết mục nào cần được bỏ khỏi checklist ca trực.
  const { data: shifts, error: shiftsError } = await supabase
    .from("truc_nhat_ca")
    .select("id")
    .gte("ngay_truc", getAppDateKey());
  throwDatabaseError(shiftsError);
  const shiftIds = (shifts ?? []).map((shift) => shift.id as string);
  if (shiftIds.length > 0) {
    const { error } = await supabase
      .from("truc_nhat_ca_dau_viec")
      .delete()
      .in("ca_id", shiftIds)
      .eq("dau_viec_mau_id", id)
      .eq("hoan_thanh", false);
    throwDatabaseError(error);
  }

  const { data, error } = await supabase
    .from("truc_nhat_dau_viec_mau")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

async function getDutyRecurringRule(supabase: ApiSupabaseClient, id: string): Promise<DutyRecurringRule | null> {
  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .select(DUTY_RULE_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? toDutyRecurringRule(data as unknown as DutyRuleRow) : null;
}

export async function listDutyRecurringRules(supabase: ApiSupabaseClient): Promise<DutyRecurringRule[]> {
  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .select(DUTY_RULE_SELECT)
    .order("thu_trong_tuan");
  throwDatabaseError(error);
  return ((data ?? []) as unknown as DutyRuleRow[]).map(toDutyRecurringRule);
}

export async function createDutyRecurringRule(
  supabase: ApiSupabaseClient,
  input: DutyRecurringRuleInput,
  access: RequestAccountAccess
): Promise<DutyRecurringRule> {
  const { ids: assigneeIds } = await resolveAccounts(supabase, input.assigneeIds, "Người trực");

  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .insert({
      thu_trong_tuan: input.weekday,
      ngay_bat_dau: input.startDate,
      ngay_ket_thuc: input.endDate ?? null,
      ghi_chu: input.note ?? null,
      dang_hoat_dong: input.active,
      created_by: access.id,
    })
    .select("id")
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Supabase không trả về quy tắc lịch trực vừa tạo.", 500);
  const ruleId = data.id as string;

  const { error: assignError } = await supabase.from("truc_nhat_lich_lap_phu_trach").insert(
    assigneeIds.map((accountId, index) => ({
      lich_lap_id: ruleId,
      tai_khoan_id: accountId,
      la_chinh: index === 0,
    }))
  );
  throwDatabaseError(assignError);

  if (input.active) {
    await generateDutyShiftsForRule(supabase, ruleId, defaultDutyGenerateToDate(input.endDate));
  }

  const rule = await getDutyRecurringRule(supabase, ruleId);
  if (!rule) throw new ApiException("Không tìm thấy quy tắc lịch trực vừa tạo.", 500);
  return rule;
}

export async function updateDutyRecurringRule(
  supabase: ApiSupabaseClient,
  id: string,
  input: DutyRecurringRuleInput
): Promise<DutyRecurringRule | null> {
  const { ids: assigneeIds } = await resolveAccounts(supabase, input.assigneeIds, "Người trực");

  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .update({
      thu_trong_tuan: input.weekday,
      ngay_bat_dau: input.startDate,
      ngay_ket_thuc: input.endDate ?? null,
      ghi_chu: input.note ?? null,
      dang_hoat_dong: input.active,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) return null;

  await syncAssignments(supabase, "truc_nhat_lich_lap_phu_trach", "lich_lap_id", id, assigneeIds);

  if (input.active) {
    await generateDutyShiftsForRule(supabase, id, defaultDutyGenerateToDate(input.endDate));
    await syncUpcomingGeneratedShiftAssignees(supabase, id, input, assigneeIds);
  }

  return getDutyRecurringRule(supabase, id);
}

export async function deleteDutyRecurringRule(supabase: ApiSupabaseClient, id: string): Promise<boolean> {
  // Ca sinh từ lịch lặp phải bị gỡ cùng quy tắc; nếu không lịch sẽ tiếp tục hiển thị
  // dữ liệu đã "chốt" dù quản trị viên đã xóa cấu hình. Ca đã chỉnh riêng giữ nguồn
  // "thu_cong" nên không bị ảnh hưởng.
  const { error: shiftsError } = await supabase
    .from("truc_nhat_ca")
    .delete()
    .eq("lich_lap_id", id)
    .eq("nguon", "lap_lich");
  throwDatabaseError(shiftsError);

  const { data, error } = await supabase
    .from("truc_nhat_lich_lap")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

async function getDutyShiftById(supabase: ApiSupabaseClient, id: string): Promise<DutyShift | null> {
  const { data, error } = await supabase.from("truc_nhat_ca").select(DUTY_SHIFT_SELECT).eq("id", id).maybeSingle();
  throwDatabaseError(error);
  return data ? toDutyShift(data as unknown as DutyShiftRow) : null;
}

/** Lịch trực cho 1 khoảng ngày, merge giữa ca đã chốt và ca "ảo" tính từ quy tắc lặp. Không ghi DB. */
export async function getDutyRosterRange(
  supabase: ApiSupabaseClient,
  from: string,
  to: string
): Promise<DutyShift[]> {
  const [{ data: shiftData, error: shiftError }, rules, templates] = await Promise.all([
    supabase.from("truc_nhat_ca").select(DUTY_SHIFT_SELECT).gte("ngay_truc", from).lte("ngay_truc", to).order("ngay_truc"),
    listActiveDutyRulesRaw(supabase, from, to),
    listDutyChecklistTemplates(supabase, true),
  ]);
  throwDatabaseError(shiftError);

  const shiftsByDate = new Map<string, DutyShift>();
  for (const row of (shiftData ?? []) as unknown as DutyShiftRow[]) {
    shiftsByDate.set(row.ngay_truc, toDutyShift(row));
  }

  const accountsById = await loadAccounts(supabase, uniqueValues(rules.flatMap((rule) => rule.assigneeIds)));

  return enumerateDateKeys(from, to).map((date) => {
    const existing = shiftsByDate.get(date);
    if (existing) return existing;
    const rule = findRuleForDate(rules, date);
    return rule ? virtualDutyShiftFromRule(date, rule, accountsById, templates) : emptyDutyShift(date);
  });
}

/**
 * Ca trực của 1 ngày cụ thể. Nếu ngày đó chưa chốt nhưng có quy tắc lặp áp
 * dụng, sẽ chốt luôn (khác `getDutyRosterRange` — trang xem theo tháng chỉ
 * hiển thị "ảo", không ghi DB) vì người dùng đang thực sự mở ngày đó ra để
 * quản lý/tick checklist.
 */
export async function getDutyShiftByDate(supabase: ApiSupabaseClient, date: string): Promise<DutyShift> {
  const { data, error } = await supabase
    .from("truc_nhat_ca")
    .select(DUTY_SHIFT_SELECT)
    .eq("ngay_truc", date)
    .maybeSingle();
  throwDatabaseError(error);
  if (data) {
    const row = data as unknown as DutyShiftRow;
    const changed = await syncMissingChecklistTemplatesToShift(
      supabase,
      row.id,
      row.truc_nhat_ca_dau_viec
    );
    const shift = changed ? await getDutyShiftById(supabase, row.id) : toDutyShift(row);
    if (!shift) throw new ApiException("Không tìm thấy ca trực sau khi đồng bộ đầu việc.", 500);

    const status = await syncDutyShiftStatus(
      supabase,
      row.id,
      shift.checklist.map((item) => item.done)
    );
    return status === shift.status ? shift : { ...shift, status };
  }

  const rules = await listActiveDutyRulesRaw(supabase, date, date);
  const rule = findRuleForDate(rules, date);
  if (!rule) return emptyDutyShift(date);

  const templates = await listDutyChecklistTemplates(supabase, true);
  // Ca trong quá khứ chỉ để xem. Không chốt ngược vào DB vì checklist đã bị
  // khóa ngoài ngày trực; nhờ đó vẫn mở được các lịch cũ chưa từng được tạo ca.
  if (date < getAppDateKey()) {
    const accountsById = await loadAccounts(supabase, rule.assigneeIds);
    return virtualDutyShiftFromRule(date, rule, accountsById, templates);
  }

  await materializeMissingShifts(supabase, [date], rules, templates);

  const shift = await supabase.from("truc_nhat_ca").select(DUTY_SHIFT_SELECT).eq("ngay_truc", date).maybeSingle();
  throwDatabaseError(shift.error);
  if (!shift.data) throw new ApiException("Không thể tạo ca trực từ lịch lặp.", 500);
  return toDutyShift(shift.data as unknown as DutyShiftRow);
}

/** Chốt (tạo mới hoặc ghi đè) ca trực cho 1 ngày cụ thể — admin giao/sửa lịch trực riêng ngày đó. */
export async function upsertDutyShift(
  supabase: ApiSupabaseClient,
  input: DutyShiftInput,
  access: RequestAccountAccess
): Promise<DutyShift> {
  const { ids: assigneeIds } = await resolveAccounts(supabase, input.assigneeIds, "Người trực");

  const { data: existing, error: existingError } = await supabase
    .from("truc_nhat_ca")
    .select("id")
    .eq("ngay_truc", input.date)
    .maybeSingle();
  throwDatabaseError(existingError);

  let caId: string;
  if (existing) {
    caId = existing.id as string;
    const { error } = await supabase
      .from("truc_nhat_ca")
      .update({
        nguon: "thu_cong",
        ghi_chu: input.note ?? null,
        ...(input.status ? { trang_thai: input.status } : {}),
      })
      .eq("id", caId);
    throwDatabaseError(error);
  } else {
    const { data, error } = await supabase
      .from("truc_nhat_ca")
      .insert({
        ngay_truc: input.date,
        nguon: "thu_cong",
        ghi_chu: input.note ?? null,
        created_by: access.id,
        ...(input.status ? { trang_thai: input.status } : {}),
      })
      .select("id")
      .single();
    throwDatabaseError(error);
    if (!data) throw new ApiException("Supabase không trả về ca trực vừa tạo.", 500);
    caId = data.id as string;
    const templates = await listDutyChecklistTemplates(supabase, true);
    await copyChecklistTemplatesToShift(supabase, caId, templates);
  }

  await syncAssignments(supabase, "truc_nhat_ca_phu_trach", "ca_id", caId, assigneeIds);

  const shift = await getDutyShiftById(supabase, caId);
  if (!shift) throw new ApiException("Không tìm thấy ca trực vừa lưu.", 500);
  return shift;
}

/** ca_id của 1 đầu việc checklist — dùng để kiểm tra quyền trước khi cho tick. */
export async function getDutyChecklistItemShiftId(
  supabase: ApiSupabaseClient,
  itemId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("truc_nhat_ca_dau_viec")
    .select("ca_id")
    .eq("id", itemId)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? (data.ca_id as string) : null;
}

/** Ngày trực của ca, dùng để chỉ cho phép xác nhận checklist đúng ngày trực. */
export async function getDutyShiftDate(
  supabase: ApiSupabaseClient,
  caId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("truc_nhat_ca")
    .select("ngay_truc")
    .eq("id", caId)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? (data.ngay_truc as string) : null;
}

export async function toggleDutyChecklistItem(
  supabase: ApiSupabaseClient,
  caId: string,
  itemId: string,
  done: boolean,
  access: RequestAccountAccess
): Promise<DutyChecklistToggleResult> {
  const { data, error } = await supabase
    .from("truc_nhat_ca_dau_viec")
    .update({
      hoan_thanh: done,
      hoan_thanh_luc: done ? new Date().toISOString() : null,
      hoan_thanh_boi: done ? access.id : null,
    })
    .eq("id", itemId)
    .select(DUTY_CHECKLIST_ITEM_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Không tìm thấy đầu việc.", 404);
  const { data: checklist, error: checklistError } = await supabase
    .from("truc_nhat_ca_dau_viec")
    .select("hoan_thanh")
    .eq("ca_id", caId);
  throwDatabaseError(checklistError);

  const doneStates = (checklist ?? []).map((row) => row.hoan_thanh as boolean);
  const status = await syncDutyShiftStatus(supabase, caId, doneStates);

  return { item: toDutyChecklistItem(data as unknown as DutyChecklistItemRow), status };
}
