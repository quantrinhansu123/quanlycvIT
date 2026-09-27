import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { listAttendanceForPeriod, saveAttendance } from "@/lib/supabase/attendance";

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") ?? "";
    const endDate = searchParams.get("endDate") ?? "";
    if (!validDate(startDate) || !validDate(endDate) || endDate <= startDate) {
      throw new ApiException("Khoảng ngày chấm công không hợp lệ.", 400);
    }
    return apiSuccess(await listAttendanceForPeriod(supabase, startDate, endDate));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const body = await readJsonObject(request);
    const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const checkIn = typeof body.checkIn === "string" ? body.checkIn.trim() : "";
    const checkOut = typeof body.checkOut === "string" ? body.checkOut.trim() : "";
    if (!employeeId) throw new ApiException("Vui lòng chọn nhân viên.", 400);
    if (!validDate(date)) throw new ApiException("Ngày chấm công không hợp lệ.", 400);
    const validTime = (time: string) => !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!validTime(checkIn) || !validTime(checkOut)) {
      throw new ApiException("Giờ check-in hoặc check-out không hợp lệ.", 400);
    }
    if (!checkIn && !checkOut) throw new ApiException("Hãy nhập ít nhất giờ check-in hoặc check-out.", 400);
    // Cho phép ca qua đêm: check-out <= check-in được hiểu là sáng hôm sau.
    // Không chặn ở đây; cách tính giờ làm sẽ tự cộng 24h.
    const attendance = await saveAttendance(supabase, access.id, { employeeId, date, checkIn, checkOut });
    return apiSuccess(attendance, 200, "Đã lưu chấm công.");
  } catch (error) {
    return handleApiError(error);
  }
}
