import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { financeDashboard } from "@/lib/supabase/finance";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const end = url.searchParams.get("end") ?? new Date().toISOString().slice(0, 10);
    const start = url.searchParams.get("start") ?? `${end.slice(0, 7)}-01`;
    const result = await financeDashboard(
      createApiSupabaseClient(request),
      Number(url.searchParams.get("page")) || 1,
      Math.min(Number(url.searchParams.get("pageSize")) || 20, 5000),
      url.searchParams.get("type") ?? undefined,
      url.searchParams.getAll("categoryId").filter(Boolean),
      start,
      end,
      url.searchParams.get("search")?.trim() || undefined,
      url.searchParams.get("sort") ?? undefined,
      url.searchParams.get("direction") ?? undefined
    );
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
