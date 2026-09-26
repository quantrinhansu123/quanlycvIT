import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { createEmployeeWorkSchedule, listEmployeeWorkSchedules } from "@/lib/supabase/work-schedules";
import type { EmployeeWorkScheduleInput } from "@/types/account";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseScheduleInput(body: Record<string, unknown>): EmployeeWorkScheduleInput {
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiException("Ngày làm việc không hợp lệ.", 400);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
    throw new ApiException("Giờ bắt đầu và kết thúc không hợp lệ.", 400);
  }
  if (endTime <= startTime) {
    throw new ApiException("Giờ kết thúc phải sau giờ bắt đầu.", 400);
  }
  if (note.length > 1000) {
    throw new ApiException("Ghi chú chỉ được tối đa 1.000 ký tự.", 400);
  }
  return { date, startTime, endTime, note };
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    return apiSuccess(await listEmployeeWorkSchedules(supabase, id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const input = parseScheduleInput(await readJsonObject(request));
    const schedule = await createEmployeeWorkSchedule(supabase, id, access.id, input);
    return apiSuccess(schedule, 201, "Đã thêm lịch làm việc.");
  } catch (error) {
    return handleApiError(error);
  }
}
