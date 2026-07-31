import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listSubtasks } from "@/lib/supabase/data";
import { assertWorkTaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertWorkTaskReadable(supabase, access, id);
    const subtasks = await listSubtasks(supabase, {
      workTaskId: id,
      assigneeIds: access.role === "member" ? [access.id] : undefined,
    });
    return apiSuccess(subtasks);
  } catch (error) {
    return handleApiError(error);
  }
}
