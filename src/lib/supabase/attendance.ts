import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, isSchemaCacheError, throwDatabaseError } from "@/lib/api/response";
import type { EmployeeAttendance, EmployeeAttendanceInput } from "@/types/account";

interface AttendanceRow {
  id: string;
  nhan_vien_id: string;
  ngay: string;
  gio_checkin: string | null;
  gio_checkout: string | null;
  task_id?: string | null;
  viec_chi_tiet?: string | null;
  nhan_vien: { ten_nv: string; ma_nv: string } | null;
  task?: { ten_task: string } | null;
}

const SELECT_BASE = "id,nhan_vien_id,ngay,gio_checkin,gio_checkout,nhan_vien:tai_khoan!nhan_vien_cham_cong_nhan_vien_id_fkey(ten_nv,ma_nv)";
const SELECT = `${SELECT_BASE},task_id,viec_chi_tiet,task:task(ten_task)`;

function mapRow(row: AttendanceRow): EmployeeAttendance {
  return {
    id: row.id,
    employeeId: row.nhan_vien_id,
    employeeName: row.nhan_vien?.ten_nv ?? "Nhân viên",
    employeeCode: row.nhan_vien?.ma_nv ?? "",
    date: row.ngay,
    checkIn: row.gio_checkin?.slice(0, 5) ?? undefined,
    checkOut: row.gio_checkout?.slice(0, 5) ?? undefined,
    taskId: row.task_id ?? undefined,
    taskTitle: row.task?.ten_task ?? undefined,
    workDetail: row.viec_chi_tiet ?? undefined,
  };
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
}

function displayDateVN(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

/**
 * Tự ghi nhật ký vào timeline của task gắn kèm khi phát sinh giờ check-in/
 * check-out mới (sửa giờ cũ không ghi để tránh spam). Không chặn lưu chính.
 */
async function logAttendanceToTaskTimeline(
  supabase: ApiSupabaseClient,
  updaterId: string,
  saved: EmployeeAttendance,
  input: EmployeeAttendanceInput,
  prevCheckIn: string | null,
  prevCheckOut: string | null,
  prevTaskId?: string | null
): Promise<void> {
  if (!input.taskId) return;
  const logCheckIn = Boolean(input.checkIn && !prevCheckIn);
  const logCheckOut = Boolean(input.checkOut && !prevCheckOut);
  // Gắn task mới (hoặc đổi sang task khác) mà giờ giấc không đổi cũng ghi 1 mốc.
  const logAttach = Boolean(
    !logCheckIn && !logCheckOut && prevTaskId !== undefined && (prevTaskId ?? null) !== input.taskId
  );
  if (!logCheckIn && !logCheckOut && !logAttach) return;
  const dayLabel = displayDateVN(input.date);
  const detailSuffix = input.workDetail ? `\nViệc thực hiện:\n${input.workDetail}` : "";
  const rows: { task_id: string; loai: string; tac_gia_id: string; tieu_de: string; chi_tiet: Record<string, string> }[] = [];
  if (logAttach) {
    rows.push({
      task_id: input.taskId,
      loai: "cham_cong",
      tac_gia_id: updaterId,
      tieu_de: `Gắn chấm công — ${saved.employeeName}`,
      chi_tiet: {
        noi_dung: `${saved.employeeName} gắn chấm công ngày ${dayLabel} vào task này.${detailSuffix}`,
        ngay: input.date,
      },
    });
  }
  if (logCheckIn && input.checkIn) {
    rows.push({
      task_id: input.taskId,
      loai: "cham_cong",
      tac_gia_id: updaterId,
      tieu_de: `Check-in ${input.checkIn} — ${saved.employeeName}`,
      chi_tiet: {
        noi_dung: `${saved.employeeName} check-in lúc ${input.checkIn} ngày ${dayLabel}.${detailSuffix}`,
        gio_checkin: input.checkIn,
        ngay: input.date,
      },
    });
  }
  if (logCheckOut && input.checkOut) {
    const overnight = Boolean(input.checkIn && input.checkOut < input.checkIn);
    const duration = input.checkIn
      ? formatDuration(toMinutes(input.checkOut) - toMinutes(input.checkIn) + (overnight ? 24 * 60 : 0))
      : null;
    rows.push({
      task_id: input.taskId,
      loai: "cham_cong",
      tac_gia_id: updaterId,
      tieu_de: `Check-out ${input.checkOut} — ${saved.employeeName}`,
      chi_tiet: {
        noi_dung: `${saved.employeeName} check-out lúc ${input.checkOut}${overnight ? " (sáng hôm sau)" : ""} ngày ${dayLabel}.${duration ? ` Tổng: ${duration}.` : ""}${detailSuffix}`,
        gio_checkout: input.checkOut,
        ngay: input.date,
      },
    });
  }
  try {
    const { error } = await supabase.from("task_hoat_dong").insert(rows);
    if (error) console.warn("Cannot log attendance to task timeline:", error.code, error.message);
  } catch (warnError) {
    console.warn("Cannot log attendance to task timeline:", warnError);
  }
}

export async function listAttendanceForPeriod(
  supabase: ApiSupabaseClient,
  startDate: string,
  endDate: string
): Promise<EmployeeAttendance[]> {
  const first = await supabase
    .from("nhan_vien_cham_cong")
    .select(SELECT)
    .gte("ngay", startDate)
    .lt("ngay", endDate)
    .order("ngay", { ascending: false })
    .order("gio_checkin", { ascending: true });
  if (first.error && isSchemaCacheError(first.error)) {
    // DB chưa chạy migration task_id: vẫn trả dữ liệu cơ bản, thiếu tên task.
    console.warn("Attendance task columns missing, falling back:", first.error.message);
    const retry = await supabase
      .from("nhan_vien_cham_cong")
      .select(SELECT_BASE)
      .gte("ngay", startDate)
      .lt("ngay", endDate)
      .order("ngay", { ascending: false })
      .order("gio_checkin", { ascending: true });
    throwDatabaseError(retry.error);
    return ((retry.data ?? []) as unknown as AttendanceRow[]).map(mapRow);
  }
  throwDatabaseError(first.error);
  return ((first.data ?? []) as unknown as AttendanceRow[]).map(mapRow);
}

export async function saveAttendance(
  supabase: ApiSupabaseClient,
  updaterId: string,
  input: EmployeeAttendanceInput
): Promise<EmployeeAttendance> {
  const basePayload = {
    nhan_vien_id: input.employeeId,
    ngay: input.date,
    gio_checkin: input.checkIn || null,
    gio_checkout: input.checkOut || null,
    nguoi_cap_nhat_id: updaterId,
    updated_at: new Date().toISOString(),
  };
  // Giờ đã có trước khi lưu — chỉ ghi timeline cho giờ mới phát sinh.
  let prevKnown = false;
  let prevCheckIn: string | null = null;
  let prevCheckOut: string | null = null;
  // undefined = không đọc được (cột task_id chưa migrate) → bỏ qua mốc gắn task.
  let prevTaskId: string | null | undefined;
  try {
    const full = await supabase
      .from("nhan_vien_cham_cong")
      .select("gio_checkin,gio_checkout,task_id")
      .eq("nhan_vien_id", input.employeeId)
      .eq("ngay", input.date)
      .maybeSingle();
    if (!full.error && full.data) {
      const row = full.data as unknown as { gio_checkin: string | null; gio_checkout: string | null; task_id: string | null };
      prevCheckIn = row.gio_checkin ? String(row.gio_checkin).slice(0, 5) : null;
      prevCheckOut = row.gio_checkout ? String(row.gio_checkout).slice(0, 5) : null;
      prevTaskId = (row.task_id as string | null) ?? null;
      prevKnown = true;
    } else if (full.error && isSchemaCacheError(full.error)) {
      const minimal = await supabase
        .from("nhan_vien_cham_cong")
        .select("gio_checkin,gio_checkout")
        .eq("nhan_vien_id", input.employeeId)
        .eq("ngay", input.date)
        .maybeSingle();
      if (!minimal.error && minimal.data) {
        const row = minimal.data as unknown as { gio_checkin: string | null; gio_checkout: string | null };
        prevCheckIn = row.gio_checkin ? String(row.gio_checkin).slice(0, 5) : null;
        prevCheckOut = row.gio_checkout ? String(row.gio_checkout).slice(0, 5) : null;
        prevKnown = true;
      }
    }
  } catch {
    // Không đọc được trạng thái cũ thì vẫn lưu chính, bỏ qua timeline.
  }
  const first = await supabase
    .from("nhan_vien_cham_cong")
    .upsert({
      ...basePayload,
      task_id: input.taskId || null,
      viec_chi_tiet: input.workDetail || null,
    }, { onConflict: "nhan_vien_id,ngay" })
    .select(SELECT)
    .single();
  if (first.error && isSchemaCacheError(first.error)) {
    // DB chưa chạy migration task_id: lưu giờ giấc, bỏ qua task/việc chi tiết.
    console.warn("Attendance task columns missing, saving without them:", first.error.message);
    const retry = await supabase
      .from("nhan_vien_cham_cong")
      .upsert(basePayload, { onConflict: "nhan_vien_id,ngay" })
      .select(SELECT_BASE)
      .single();
    throwDatabaseError(retry.error);
    if (!retry.data) throw new ApiException("Không thể lưu dữ liệu chấm công.", 500);
    return mapRow(retry.data as unknown as AttendanceRow);
  }
  throwDatabaseError(first.error);
  if (!first.data) throw new ApiException("Không thể lưu dữ liệu chấm công.", 500);
  const saved = mapRow(first.data as unknown as AttendanceRow);
  if (prevKnown) {
    await logAttendanceToTaskTimeline(supabase, updaterId, saved, input, prevCheckIn, prevCheckOut, prevTaskId);
  }
  return saved;
}
