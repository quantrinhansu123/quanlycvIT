import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createEmployeeWorkSchedule, createEmployeeWorkSchedules, listWorkSchedulesForPeriod } from "@/lib/supabase/work-schedules";
import type { EmployeeWorkScheduleInput } from "@/types/account";

function parseScheduleInput(body: Record<string, unknown>): EmployeeWorkScheduleInput {
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new ApiException("Ngày làm việc không hợp lệ.", 400);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime) {
    throw new ApiException("Giờ làm việc không hợp lệ.", 400);
  }
  if (note.length > 1000) throw new ApiException("Ghi chú chỉ được tối đa 1.000 ký tự.", 400);
  return { date, startTime, endTime, note };
}

export async function GET(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") ?? "";
    const endDate = searchParams.get("endDate") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate <= startDate) {
      throw new ApiException("Khoảng ngày không hợp lệ.", 400);
    }
    return apiSuccess(await listWorkSchedulesForPeriod(supabase, startDate, endDate));
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
    const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
    if (!employeeId) throw new ApiException("Vui lòng chọn nhân viên.", 400);
    if (Array.isArray(body.schedules)) {
      if (body.schedules.length < 1 || body.schedules.length > 370) {
        throw new ApiException("Số buổi đăng ký phải từ 1 đến 370.", 400);
      }
      const inputs = body.schedules.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new ApiException("Thông tin buổi làm việc không hợp lệ.", 400);
        }
        return parseScheduleInput(value as Record<string, unknown>);
      });
      const created = await createEmployeeWorkSchedules(supabase, employeeId, access.id, inputs);
      return apiSuccess(created, 201, `Đã thêm ${created.length} buổi làm việc.`);
    }
    const schedule = await createEmployeeWorkSchedule(supabase, employeeId, access.id, parseScheduleInput(body));
    return apiSuccess(schedule, 201, "Đã thêm lịch làm việc.");
  } catch (error) {
    return handleApiError(error);
  }
}
