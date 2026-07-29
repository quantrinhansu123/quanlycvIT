import { apiSuccess, handleApiError } from "@/lib/api/response";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { listDirectory } from "@/lib/supabase/data";

export async function GET(request: Request) {
  try {
    const users = await listDirectory(createApiSupabaseClient(request));
    return apiSuccess(users);
  } catch (error) {
    return handleApiError(error);
  }
}
