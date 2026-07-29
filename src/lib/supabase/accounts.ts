import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { throwDatabaseError } from "@/lib/api/response";
import type {
  AccountDirectory,
  AccountInput,
  Department,
  EmployeeAccount,
} from "@/types/account";

const ACCOUNT_SELECT = `
  id,ma_nv,ten_nv,sdt,dia_chi,avatar_url,ngay_sinh,ngay_vao_lam,ngay_nghi_viec,
  so_tai_khoan,ten_ngan_hang,ghi_chu,username,email,phong_ban_id,chuc_vu,role,status,
  created_at,updated_at,
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
    username: nullable(input.username),
    email: nullable(input.email)?.toLowerCase() ?? null,
    phong_ban_id: nullable(input.departmentId),
    chuc_vu: nullable(input.position),
    role: input.role,
    status: input.status,
  };
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
