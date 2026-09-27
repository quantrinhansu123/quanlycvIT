import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import type { EmployeeAttendance, EmployeeAttendanceInput } from "@/types/account";

interface AttendanceRow {
  id: string;
  nhan_vien_id: string;
  ngay: string;
  gio_checkin: string | null;
  gio_checkout: string | null;
  nhan_vien: { ten_nv: string; ma_nv: string } | null;
}

const SELECT = "id,nhan_vien_id,ngay,gio_checkin,gio_checkout,nhan_vien:tai_khoan!nhan_vien_cham_cong_nhan_vien_id_fkey(ten_nv,ma_nv)";

function mapRow(row: AttendanceRow): EmployeeAttendance {
  return {
    id: row.id,
    employeeId: row.nhan_vien_id,
    employeeName: row.nhan_vien?.ten_nv ?? "Nhân viên",
    employeeCode: row.nhan_vien?.ma_nv ?? "",
    date: row.ngay,
    checkIn: row.gio_checkin?.slice(0, 5) ?? undefined,
    checkOut: row.gio_checkout?.slice(0, 5) ?? undefined,
  };
}

export async function listAttendanceForPeriod(
  supabase: ApiSupabaseClient,
  startDate: string,
  endDate: string
): Promise<EmployeeAttendance[]> {
  const { data, error } = await supabase
    .from("nhan_vien_cham_cong")
    .select(SELECT)
    .gte("ngay", startDate)
    .lt("ngay", endDate)
    .order("ngay", { ascending: false })
    .order("gio_checkin", { ascending: true });
  throwDatabaseError(error);
  return ((data ?? []) as unknown as AttendanceRow[]).map(mapRow);
}

export async function saveAttendance(
  supabase: ApiSupabaseClient,
  updaterId: string,
  input: EmployeeAttendanceInput
): Promise<EmployeeAttendance> {
  const { data, error } = await supabase
    .from("nhan_vien_cham_cong")
    .upsert({
      nhan_vien_id: input.employeeId,
      ngay: input.date,
      gio_checkin: input.checkIn || null,
      gio_checkout: input.checkOut || null,
      nguoi_cap_nhat_id: updaterId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "nhan_vien_id,ngay" })
    .select(SELECT)
    .single();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Không thể lưu dữ liệu chấm công.", 500);
  return mapRow(data as unknown as AttendanceRow);
}
