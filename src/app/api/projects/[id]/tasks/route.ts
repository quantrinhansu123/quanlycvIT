import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listProjectTasks } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tasks = await listProjectTasks(createApiSupabaseClient(request), id);
    return apiSuccess(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}
