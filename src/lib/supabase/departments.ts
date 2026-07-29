import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { throwDatabaseError } from "@/lib/api/response";
import type { DepartmentInput, DepartmentRecord } from "@/types/department";

const DEPARTMENT_SELECT = `
  id,ma_pb,ten_pb,phong_ban_cha_id,cap_do,chuc_vu,cau_truc_chuc_vu,mo_ta,trang_thai_cv,
  ngay_tao,updated_at,tai_khoan(id,chuc_vu)
`;

interface DepartmentRow {
  id: string;
  ma_pb: string;
  ten_pb: string;
  phong_ban_cha_id: string | null;
  cap_do: number;
  chuc_vu: string[] | null;
  cau_truc_chuc_vu: unknown;
  mo_ta: string | null;
  trang_thai_cv: "active" | "inactive";
  ngay_tao: string;
  updated_at: string;
  tai_khoan?: { id: string; chuc_vu: string | null }[];
}

function mapDepartment(row: DepartmentRow): DepartmentRecord {
  const employees = row.tai_khoan ?? [];
  const rawStructure = Array.isArray(row.cau_truc_chuc_vu)
    ? row.cau_truc_chuc_vu
    : [];
  const positionStructure = rawStructure
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `legacy-${index}`,
      name: typeof item.name === "string" ? item.name : "",
      level: typeof item.level === "number" ? item.level : index + 1,
      managerId: typeof item.managerId === "string" ? item.managerId : undefined,
    }))
    .filter((position) => position.name);
  const normalizedStructure = positionStructure.length
    ? positionStructure
    : (row.chuc_vu ?? []).map((name, index) => ({
        id: `legacy-${index}`,
        name,
        level: index + 1,
      }));
  const positionCounts = employees.reduce<Record<string, number>>((counts, employee) => {
    if (employee.chuc_vu) counts[employee.chuc_vu] = (counts[employee.chuc_vu] ?? 0) + 1;
    return counts;
  }, {});

  return {
    id: row.id,
    code: row.ma_pb,
    name: row.ten_pb,
    parentId: row.phong_ban_cha_id ?? undefined,
    level: row.cap_do,
    positions: row.chuc_vu ?? [],
    positionStructure: normalizedStructure,
    description: row.mo_ta ?? undefined,
    status: row.trang_thai_cv,
    createdAt: row.ngay_tao,
    updatedAt: row.updated_at,
    employeeCount: employees.length,
    positionCounts,
  };
}

function toRow(input: DepartmentInput) {
  return {
    ma_pb: input.code.trim().toUpperCase(),
    ten_pb: input.name.trim(),
    phong_ban_cha_id: input.parentId?.trim() || null,
    cap_do: input.level,
    chuc_vu: input.positionStructure.map((position) => position.name),
    cau_truc_chuc_vu: input.positionStructure,
    mo_ta: input.description?.trim() || null,
    trang_thai_cv: input.status,
  };
}

export async function listDepartments(supabase: ApiSupabaseClient): Promise<DepartmentRecord[]> {
  const { data, error } = await supabase
    .from("phong_ban")
    .select(DEPARTMENT_SELECT)
    .order("ngay_tao", { ascending: false });
  throwDatabaseError(error);
  return ((data ?? []) as unknown as DepartmentRow[]).map(mapDepartment);
}

export async function createDepartment(
  supabase: ApiSupabaseClient,
  input: DepartmentInput
): Promise<DepartmentRecord> {
  const { data, error } = await supabase
    .from("phong_ban")
    .insert(toRow(input))
    .select(DEPARTMENT_SELECT)
    .single();
  throwDatabaseError(error);
  return mapDepartment(data as unknown as DepartmentRow);
}

export async function updateDepartment(
  supabase: ApiSupabaseClient,
  id: string,
  input: DepartmentInput
): Promise<DepartmentRecord | null> {
  const { data, error } = await supabase
    .from("phong_ban")
    .update(toRow(input))
    .eq("id", id)
    .select(DEPARTMENT_SELECT)
    .maybeSingle();
  throwDatabaseError(error);
  return data ? mapDepartment(data as unknown as DepartmentRow) : null;
}

export async function deleteDepartment(
  supabase: ApiSupabaseClient,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("phong_ban")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}
