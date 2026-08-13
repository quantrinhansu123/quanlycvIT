import type { NextRequest } from "next/server";
import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseDutyShiftInput } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { getDutyRosterRange, upsertDutyShift } from "@/lib/supabase/data";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);
    await requireRequestAccount(supabase);
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      throw new ApiException("Vui lòng truyền from/to theo định dạng YYYY-MM-DD.", 400);
    }
    const roster = await getDutyRosterRange(supabase, from, to);
    return apiSuccess(roster);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    assertManagerOrAdmin(access);
    const input = parseDutyShiftInput(await readJsonObject(request));
    const shift = await upsertDutyShift(supabase, input, access);
    return apiSuccess(shift, 200, "Giao lịch trực thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
