import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { throwDatabaseError } from "@/lib/api/response";
import type { EmployeeWorkSchedule, EmployeeWorkScheduleInput } from "@/types/account";

interface WorkScheduleRow {
  id: string;
  nhan_vien_id: string;
  ngay: string;
  gio_bat_dau: string;
  gio_ket_thuc: string;
  ghi_chu: string | null;
  created_at: string;
}

function mapWorkSchedule(row: WorkScheduleRow): EmployeeWorkSchedule {
  return {
    id: row.id,
    employeeId: row.nhan_vien_id,
    date: row.ngay,
    startTime: row.gio_bat_dau,
    endTime: row.gio_ket_thuc,
    note: row.ghi_chu ?? undefined,
    createdAt: row.created_at,
  };
}

const WORK_SCHEDULE_SELECT = "id,nhan_vien_id,ngay,gio_bat_dau,gio_ket_thuc,ghi_chu,created_at";

export async function listWorkSchedulesForPeriod(
  supabase: ApiSupabaseClient,
  startDate: string,
  endDate: string
): Promise<EmployeeWorkSchedule[]> {
  const { data, error } = await supabase
    .from("nhan_vien_lich_lam_viec")
    .select(`${WORK_SCHEDULE_SELECT},nhan_vien:tai_khoan!nhan_vien_lich_lam_viec_nhan_vien_id_fkey(ten_nv,ma_nv)`)
    .gte("ngay", startDate)
    .lt("ngay", endDate)
    .order("ngay", { ascending: true })
    .order("gio_bat_dau", { ascending: true });
  throwDatabaseError(error);
  return ((data ?? []) as unknown as Array<WorkScheduleRow & { nhan_vien: { ten_nv: string; ma_nv: string } | null }>).map((row) => ({
    ...mapWorkSchedule(row),
    employeeName: row.nhan_vien?.ten_nv,
    employeeCode: row.nhan_vien?.ma_nv,
  }));
}

export async function listEmployeeWorkSchedules(
  supabase: ApiSupabaseClient,
  employeeId: string
): Promise<EmployeeWorkSchedule[]> {
  const { data, error } = await supabase
    .from("nhan_vien_lich_lam_viec")
    .select(WORK_SCHEDULE_SELECT)
    .eq("nhan_vien_id", employeeId)
    .order("ngay", { ascending: true })
    .order("gio_bat_dau", { ascending: true });
  throwDatabaseError(error);
  return ((data ?? []) as unknown as WorkScheduleRow[]).map(mapWorkSchedule);
}

export async function createEmployeeWorkSchedule(
  supabase: ApiSupabaseClient,
  employeeId: string,
  creatorId: string,
  input: EmployeeWorkScheduleInput
): Promise<EmployeeWorkSchedule> {
  const { data, error } = await supabase
    .from("nhan_vien_lich_lam_viec")
    .insert({
      nhan_vien_id: employeeId,
      ngay: input.date,
      gio_bat_dau: input.startTime,
      gio_ket_thuc: input.endTime,
      ghi_chu: input.note?.trim() || null,
      nguoi_tao_id: creatorId,
    })
    .select(WORK_SCHEDULE_SELECT)
    .single();
  throwDatabaseError(error);
  return mapWorkSchedule(data as unknown as WorkScheduleRow);
}

export async function createEmployeeWorkSchedules(
  supabase: ApiSupabaseClient,
  employeeId: string,
  creatorId: string,
  inputs: EmployeeWorkScheduleInput[]
): Promise<EmployeeWorkSchedule[]> {
  if (!inputs.length) return [];
  const dates = [...new Set(inputs.map((input) => input.date))];
  const { data: existingRows, error: existingError } = await supabase
    .from("nhan_vien_lich_lam_viec")
    .select("ngay,gio_bat_dau,gio_ket_thuc")
    .eq("nhan_vien_id", employeeId)
    .in("ngay", dates);
  throwDatabaseError(existingError);

  const existing = new Set((existingRows ?? []).map((row) => `${row.ngay}|${String(row.gio_bat_dau).slice(0, 5)}|${String(row.gio_ket_thuc).slice(0, 5)}`));
  const uniqueInputs = new Map<string, EmployeeWorkScheduleInput>();
  for (const input of inputs) {
    const key = `${input.date}|${input.startTime}|${input.endTime}`;
    if (!existing.has(key)) uniqueInputs.set(key, input);
  }
  if (!uniqueInputs.size) return [];

  const rows = [...uniqueInputs.values()].map((input) => ({
    nhan_vien_id: employeeId,
    ngay: input.date,
    gio_bat_dau: input.startTime,
    gio_ket_thuc: input.endTime,
    ghi_chu: input.note?.trim() || null,
    nguoi_tao_id: creatorId,
  }));
  const { data, error } = await supabase
    .from("nhan_vien_lich_lam_viec")
    .insert(rows)
    .select(WORK_SCHEDULE_SELECT);
  throwDatabaseError(error);
  return ((data ?? []) as unknown as WorkScheduleRow[]).map(mapWorkSchedule);
}
