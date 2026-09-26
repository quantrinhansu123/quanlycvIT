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
