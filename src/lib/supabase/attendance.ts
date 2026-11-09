import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, isSchemaCacheError, throwDatabaseError } from "@/lib/api/response";
import type { EmployeeAttendance, EmployeeAttendanceInput } from "@/types/account";

/**
 * Lỗi cột chưa tồn tại (chưa chạy migration) — PostgREST trả 42703 khi select
 * một cột không có trong bảng. Gộp chung với lỗi schema cache để fallback.
 */
function isMissingColumn(error: Parameters<typeof isSchemaCacheError>[0]): boolean {
  return isSchemaCacheError(error) || error?.code === "42703";
}

interface AttendanceRow {
  id: string;
  nhan_vien_id: string;
  ngay: string;
  gio_checkin: string | null;
  gio_checkout: string | null;
  task_id?: string | null;
  task_ids?: string[] | null;
  viec_chi_tiet?: string | null;
  nhan_vien: { ten_nv: string; ma_nv: string } | null;
  task?: { ten_task: string } | null;
}

const SELECT_BASE = "id,nhan_vien_id,ngay,gio_checkin,gio_checkout,nhan_vien:tai_khoan!nhan_vien_cham_cong_nhan_vien_id_fkey(ten_nv,ma_nv)";
const SELECT = `${SELECT_BASE},task_id,viec_chi_tiet,task:task(ten_task)`;
const SELECT_MULTI_TASK = `${SELECT_BASE},task_id,task_ids,viec_chi_tiet,task:task(ten_task)`;

function mapRow(row: AttendanceRow): EmployeeAttendance {
  const taskIds = row.task_ids?.length
    ? row.task_ids
    : row.task_id
      ? [row.task_id]
      : [];
  return {
    id: row.id,
    employeeId: row.nhan_vien_id,
    employeeName: row.nhan_vien?.ten_nv ?? "Nhân viên",
    employeeCode: row.nhan_vien?.ma_nv ?? "",
    date: row.ngay,
    checkIn: row.gio_checkin?.slice(0, 5) ?? undefined,
    checkOut: row.gio_checkout?.slice(0, 5) ?? undefined,
    taskId: taskIds[0],
    taskIds,
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
  prevTaskIds?: string[]
): Promise<void> {
  const taskIds = input.taskIds?.length ? input.taskIds : input.taskId ? [input.taskId] : [];
  if (!taskIds.length) return;
  const primaryTaskId = taskIds[0];
  const logCheckIn = Boolean(input.checkIn && !prevCheckIn);
  const logCheckOut = Boolean(input.checkOut && !prevCheckOut);
  // Task mới được gắn (hoặc đổi sang task khác) mà giờ giấc không đổi cũng ghi 1 mốc.
  const attachedTaskIds = prevTaskIds === undefined
    ? []
    : taskIds.filter((taskId) => !prevTaskIds.includes(taskId));
  const logAttach = !logCheckIn && !logCheckOut && attachedTaskIds.length > 0;
  if (!logCheckIn && !logCheckOut && !logAttach) return;
  const dayLabel = displayDateVN(input.date);
  const detailSuffix = input.workDetail ? `\nViệc thực hiện:\n${input.workDetail}` : "";
  const rows: { task_id: string; loai: string; tac_gia_id: string; tieu_de: string; chi_tiet: Record<string, string> }[] = [];
  if (logAttach) {
    for (const taskId of attachedTaskIds) {
      rows.push({
        task_id: taskId,
        loai: "cham_cong",
        tac_gia_id: updaterId,
        tieu_de: `Gắn chấm công — ${saved.employeeName}`,
        chi_tiet: {
          noi_dung: `${saved.employeeName} gắn chấm công ngày ${dayLabel} vào task này.${detailSuffix}`,
          ngay: input.date,
        },
      });
    }
  }
  if (logCheckIn && input.checkIn) {
    rows.push({
      task_id: primaryTaskId,
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
      task_id: primaryTaskId,
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
  const query = (columns: string) =>
    supabase
      .from("nhan_vien_cham_cong")
      .select(columns)
      .gte("ngay", startDate)
      .lt("ngay", endDate)
      .order("ngay", { ascending: false })
      .order("gio_checkin", { ascending: true });

  const multiTask = await query(SELECT_MULTI_TASK);
  if (!multiTask.error) {
    return ((multiTask.data ?? []) as unknown as AttendanceRow[]).map(mapRow);
  }
  if (isMissingColumn(multiTask.error)) {
    // DB chưa chạy migration task_ids: đọc task đơn như cũ.
    const singleTask = await query(SELECT);
    if (!singleTask.error) {
      return ((singleTask.data ?? []) as unknown as AttendanceRow[]).map(mapRow);
    }
    if (isMissingColumn(singleTask.error)) {
      // DB chưa chạy migration task_id: vẫn trả dữ liệu cơ bản, thiếu tên task.
      console.warn("Attendance task columns missing, falling back:", singleTask.error.message);
      const base = await query(SELECT_BASE);
      throwDatabaseError(base.error);
      return ((base.data ?? []) as unknown as AttendanceRow[]).map(mapRow);
    }
    throwDatabaseError(singleTask.error);
    return [];
  }
  throwDatabaseError(multiTask.error);
  return [];
}

export async function deleteAttendance(
  supabase: ApiSupabaseClient,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from("nhan_vien_cham_cong")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Bản ghi chấm công không tồn tại hoặc đã bị xóa.", 404);
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
  // undefined = không đọc được (cột task chưa migrate) → bỏ qua mốc gắn task.
  let prevTaskIds: string[] | undefined;
  try {
    const readPrev = (columns: string) =>
      supabase
        .from("nhan_vien_cham_cong")
        .select(columns)
        .eq("nhan_vien_id", input.employeeId)
        .eq("ngay", input.date)
        .maybeSingle();
    type PrevRow = { gio_checkin: string | null; gio_checkout: string | null; task_id?: string | null; task_ids?: string[] | null };
    let prev = await readPrev("gio_checkin,gio_checkout,task_id,task_ids");
    if (prev.error && isMissingColumn(prev.error)) {
      prev = await readPrev("gio_checkin,gio_checkout,task_id");
    }
    if (prev.error && isMissingColumn(prev.error)) {
      prev = await readPrev("gio_checkin,gio_checkout");
    }
    if (!prev.error && prev.data) {
      const row = prev.data as unknown as PrevRow;
      prevCheckIn = row.gio_checkin ? String(row.gio_checkin).slice(0, 5) : null;
      prevCheckOut = row.gio_checkout ? String(row.gio_checkout).slice(0, 5) : null;
      prevTaskIds = row.task_ids?.length ? row.task_ids : row.task_id ? [row.task_id] : [];
      prevKnown = true;
    }
  } catch {
    // Không đọc được trạng thái cũ thì vẫn lưu chính, bỏ qua timeline.
  }
  // task_id giữ task đầu tiên để tương thích dữ liệu cũ; task_ids lưu toàn bộ.
  const taskIds = input.taskIds?.length ? input.taskIds : input.taskId ? [input.taskId] : [];
  const taskPayload = {
    task_id: taskIds[0] ?? null,
    task_ids: taskIds,
    viec_chi_tiet: input.workDetail || null,
  };
  const upsert = (payload: Record<string, unknown>, columns: string) =>
    supabase
      .from("nhan_vien_cham_cong")
      .upsert({ ...basePayload, ...payload }, { onConflict: "nhan_vien_id,ngay" })
      .select(columns)
      .single();

  let first = await upsert(taskPayload, SELECT_MULTI_TASK);
  if (first.error && isMissingColumn(first.error)) {
    // DB chưa chạy migration task_ids: lưu task đơn như cũ.
    first = await upsert({ task_id: taskPayload.task_id, viec_chi_tiet: taskPayload.viec_chi_tiet }, SELECT);
  }
  if (first.error && isMissingColumn(first.error)) {
    // DB chưa chạy migration task_id: lưu giờ giấc, bỏ qua task/việc chi tiết.
    console.warn("Attendance task columns missing, saving without them:", first.error.message);
    first = await upsert({}, SELECT_BASE);
  }
  throwDatabaseError(first.error);
  if (!first.data) throw new ApiException("Không thể lưu dữ liệu chấm công.", 500);
  const saved = mapRow(first.data as unknown as AttendanceRow);
  if (prevKnown) {
    await logAttendanceToTaskTimeline(supabase, updaterId, saved, input, prevCheckIn, prevCheckOut, prevTaskIds);
  }
  return saved;
}
