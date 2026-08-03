import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import type {
  AccountDirectory,
  AccountInput,
  AccountListFilters,
  AccountListSummary,
  AccountPage,
  Department,
  EmployeeAccount,
} from "@/types/account";

const ACCOUNT_SELECT = `
  id,auth_user_id,ma_nv,ten_nv,sdt,dia_chi,avatar_url,ngay_sinh,ngay_vao_lam,ngay_nghi_viec,
  so_tai_khoan,ten_ngan_hang,ghi_chu,username,email,phong_ban_id,chuc_vu,role,status,
  created_at,updated_at,
  phong_ban:phong_ban_id(id,ma_pb,ten_pb,chuc_vu)
`;

const ACCOUNT_LIST_SELECT = `
  id,ma_nv,ten_nv,sdt,avatar_url,ngay_vao_lam,username,email,phong_ban_id,chuc_vu,role,status,
  created_at,updated_at,
  phong_ban:phong_ban_id(id,ma_pb,ten_pb,chuc_vu)
`;

const ACCOUNT_ANALYTICS_SELECT = `
  id,ma_nv,ten_nv,sdt,avatar_url,ngay_sinh,ngay_vao_lam,ngay_nghi_viec,
  so_tai_khoan,ten_ngan_hang,email,phong_ban_id,chuc_vu,role,status,created_at,updated_at,
  phong_ban:phong_ban_id(id,ma_pb,ten_pb,chuc_vu)
`;

interface DepartmentRow {
  id: string;
  ma_pb: string;
  ten_pb: string;
  chuc_vu: string[] | null;
}

function mapDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    code: row.ma_pb,
    name: row.ten_pb,
    positions: row.chuc_vu ?? [],
  };
}

function mapAccount(row: Record<string, unknown>): EmployeeAccount {
  const relation = Array.isArray(row.phong_ban)
    ? row.phong_ban[0]
    : row.phong_ban;
  const department = relation
    ? mapDepartment(relation as DepartmentRow)
    : undefined;
  return {
    id: String(row.id),
    authUserId: (row.auth_user_id as string | null) ?? undefined,
    employeeCode: String(row.ma_nv),
    name: String(row.ten_nv),
    phone: (row.sdt as string | null) ?? undefined,
    address: (row.dia_chi as string | null) ?? undefined,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    birthDate: (row.ngay_sinh as string | null) ?? undefined,
    startDate: (row.ngay_vao_lam as string | null) ?? undefined,
    endDate: (row.ngay_nghi_viec as string | null) ?? undefined,
    bankAccount: (row.so_tai_khoan as string | null) ?? undefined,
    bankName: (row.ten_ngan_hang as string | null) ?? undefined,
    note: (row.ghi_chu as string | null) ?? undefined,
    username: (row.username as string | null) ?? undefined,
    email: (row.email as string | null) ?? undefined,
    departmentId: (row.phong_ban_id as string | null) ?? undefined,
    department,
    position: (row.chuc_vu as string | null) ?? undefined,
    role: row.role as EmployeeAccount["role"],
    status: row.status as EmployeeAccount["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toRow(input: AccountInput) {
  const nullable = (value?: string) => value?.trim() || null;
  return {
    ma_nv: input.employeeCode.trim().toUpperCase(),
    ten_nv: input.name.trim(),
    sdt: nullable(input.phone),
    dia_chi: nullable(input.address),
    avatar_url: nullable(input.avatarUrl),
    ngay_sinh: nullable(input.birthDate),
    ngay_vao_lam: nullable(input.startDate),
    ngay_nghi_viec: nullable(input.endDate),
    so_tai_khoan: nullable(input.bankAccount),
    ten_ngan_hang: nullable(input.bankName),
    ghi_chu: nullable(input.note),
    username: nullable(input.username)?.toLowerCase() ?? null,
    email: nullable(input.email)?.toLowerCase() ?? null,
    phong_ban_id: nullable(input.departmentId),
    chuc_vu: nullable(input.position),
    role: input.role,
    status: input.status,
  };
}

function normalizeSearchTerm(value?: string): string | undefined {
  const normalized = value?.trim().replace(/[,().%_]/g, " ").trim();
  return normalized || undefined;
}

function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

const ACCOUNT_SORT_COLUMNS: Record<NonNullable<AccountListFilters["sort"]>, string> = {
  employeeCode: "ma_nv",
  name: "ten_nv",
  username: "username",
  startDate: "ngay_vao_lam",
  createdAt: "created_at",
};

export async function listAccountsPage(
  supabase: ApiSupabaseClient,
  filters: AccountListFilters,
  excludedAccountId?: string
): Promise<AccountPage> {
  let query = supabase
    .from("tai_khoan")
    .select(ACCOUNT_LIST_SELECT, { count: "exact" });

  const term = normalizeSearchTerm(filters.search);
  if (term) {
    query = query.or(
      `ten_nv.ilike.%${term}%,ma_nv.ilike.%${term}%,email.ilike.%${term}%,username.ilike.%${term}%,sdt.ilike.%${term}%`
    );
  }
  if (filters.departmentId) query = query.eq("phong_ban_id", filters.departmentId);
  if (filters.position) query = query.eq("chuc_vu", filters.position);
  if (filters.role) query = query.eq("role", filters.role);
  if (filters.status) query = query.eq("status", filters.status);
  if (excludedAccountId) query = query.neq("id", excludedAccountId);

  const sortColumn = ACCOUNT_SORT_COLUMNS[filters.sort ?? "createdAt"];
  query = query.order(sortColumn, { ascending: filters.direction === "asc" });
  if (sortColumn !== "created_at") query = query.order("created_at", { ascending: false });

  const { from, to } = pageRange(filters.page, filters.pageSize);
  const [pageResult, departmentsResult] = await Promise.all([
    query.range(from, to),
    supabase.from("phong_ban").select("id,ma_pb,ten_pb,chuc_vu").order("ten_pb"),
  ]);
  throwDatabaseError(pageResult.error);
  throwDatabaseError(departmentsResult.error);

  const departments = ((departmentsResult.data ?? []) as DepartmentRow[]).map(mapDepartment);
  const baseCount = () => {
    let countQuery = supabase.from("tai_khoan").select("id", { count: "exact", head: true });
    if (excludedAccountId) countQuery = countQuery.neq("id", excludedAccountId);
    return countQuery;
  };
  const [totalResult, activeResult, adminResult, ...departmentResults] = await Promise.all([
    baseCount(),
    baseCount().eq("status", "active"),
    baseCount().eq("role", "admin"),
    ...departments.map((department) => baseCount().eq("phong_ban_id", department.id)),
  ]);
  for (const result of [totalResult, activeResult, adminResult, ...departmentResults]) {
    throwDatabaseError(result.error);
  }

  const summary: AccountListSummary = {
    total: totalResult.count ?? 0,
    active: activeResult.count ?? 0,
    admins: adminResult.count ?? 0,
    positions: [...new Set(departments.flatMap((department) => department.positions))].sort((a, b) => a.localeCompare(b, "vi")),
    departments: departments.map((department, index) => ({
      id: department.id,
      count: departmentResults[index]?.count ?? 0,
    })),
  };

  return {
    items: (pageResult.data ?? []).map((row) => mapAccount(row as Record<string, unknown>)),
    total: pageResult.count ?? 0,
    departments,
    summary,
  };
}

export async function listAccountAnalytics(
  supabase: ApiSupabaseClient
): Promise<AccountDirectory> {
  const [{ data: accounts, error: accountError }, { data: departments, error: departmentError }] =
    await Promise.all([
      supabase.from("tai_khoan").select(ACCOUNT_ANALYTICS_SELECT).order("created_at", { ascending: false }),
      supabase.from("phong_ban").select("id,ma_pb,ten_pb,chuc_vu").order("ten_pb"),
    ]);
  throwDatabaseError(accountError);
  throwDatabaseError(departmentError);
  return {
    accounts: (accounts ?? []).map((row) => mapAccount(row as Record<string, unknown>)),
    departments: ((departments ?? []) as DepartmentRow[]).map(mapDepartment),
  };
}

export async function listAccountDepartments(
  supabase: ApiSupabaseClient
): Promise<Department[]> {
  const { data, error } = await supabase
    .from("phong_ban")
    .select("id,ma_pb,ten_pb,chuc_vu")
    .order("ten_pb");
  throwDatabaseError(error);
  return ((data ?? []) as DepartmentRow[]).map(mapDepartment);
}

export async function listAccountDirectory(
  supabase: ApiSupabaseClient
): Promise<AccountDirectory> {
  const [{ data: accounts, error: accountError }, { data: departments, error: departmentError }] =
    await Promise.all([
      supabase.from("tai_khoan").select(ACCOUNT_SELECT).order("created_at", { ascending: false }),
      supabase.from("phong_ban").select("id,ma_pb,ten_pb,chuc_vu").order("ten_pb"),
    ]);
  throwDatabaseError(accountError);
  throwDatabaseError(departmentError);
  return {
    accounts: (accounts ?? []).map((row) => mapAccount(row as Record<string, unknown>)),
    departments: ((departments ?? []) as DepartmentRow[]).map(mapDepartment),
  };
}

export async function createAccount(
  supabase: ApiSupabaseClient,
  input: AccountInput
): Promise<EmployeeAccount> {
  const { data, error } = await supabase
    .from("tai_khoan")
    .insert(toRow(input))
    .select(ACCOUNT_SELECT)
    .single();
  throwDatabaseError(error);
  return mapAccount(data as Record<string, unknown>);
}

export async function createAccounts(
  supabase: ApiSupabaseClient,
  inputs: AccountInput[]
): Promise<EmployeeAccount[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase
    .from("tai_khoan")
    .insert(inputs.map(toRow))
    .select(ACCOUNT_SELECT);
  throwDatabaseError(error);
  return (data ?? []).map((row) => mapAccount(row as Record<string, unknown>));
}

export async function updateAccountsStatus(
  supabase: ApiSupabaseClient,
  ids: string[],
  status: EmployeeAccount["status"]
): Promise<EmployeeAccount[]> {
  if (ids.length === 0) return [];

  // Validate the complete target set before the single bulk mutation. This prevents
  // a stale selection from silently updating only a subset of the requested ids.
  const { data: existing, error: readError } = await supabase
    .from("tai_khoan")
    .select("id")
    .in("id", ids);
  throwDatabaseError(readError);
  if ((existing ?? []).length !== ids.length) {
    throw new ApiException("Một hoặc nhiều tài khoản không còn tồn tại.", 409);
  }

  const { data, error } = await supabase
    .from("tai_khoan")
    .update({ status })
    .in("id", ids)
    .select(ACCOUNT_SELECT);
  throwDatabaseError(error);
  if ((data ?? []).length !== ids.length) {
    throw new ApiException("Danh sách tài khoản đã thay đổi trong lúc cập nhật.", 409);
  }
  return (data ?? []).map((row) => mapAccount(row as Record<string, unknown>));
}

export async function getAccount(
  supabase: ApiSupabaseClient,
  id: string
): Promise<EmployeeAccount | null> {
  const { data, error } = await supabase
    .from("tai_khoan")
    .select(ACCOUNT_SELECT)
    .eq("id", id)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? mapAccount(data as Record<string, unknown>) : null;
}

export async function updateAccount(
  supabase: ApiSupabaseClient,
  id: string,
  input: AccountInput
): Promise<EmployeeAccount | null> {
  const { data, error } = await supabase
    .from("tai_khoan")
    .update(toRow(input))
    .eq("id", id)
    .select(ACCOUNT_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? mapAccount(data as Record<string, unknown>) : null;
}

export async function deleteAccount(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("tai_khoan")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}
