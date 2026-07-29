import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listSubtasks } from "@/lib/supabase/data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const subtasks = await listSubtasks(createApiSupabaseClient(request), {
      workTaskId: id,
    });
    return apiSuccess(subtasks);
  } catch (error) {
    return handleApiError(error);
  }
}
