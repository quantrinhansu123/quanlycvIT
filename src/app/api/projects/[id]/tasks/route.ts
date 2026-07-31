import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listProjectTasks } from "@/lib/supabase/data";
import { assertProjectReadable, requireRequestAccount } from "@/lib/supabase/authorization";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    await assertProjectReadable(supabase, access, id);
    const tasks = await listProjectTasks(
      supabase,
      id,
      access.role === "member" ? [access.id] : undefined
    );
    return apiSuccess(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}
