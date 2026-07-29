import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiException } from "@/lib/api/response";

export type ApiSupabaseClient = SupabaseClient;

export function createApiSupabaseClient(request: Request): ApiSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new ApiException(
      "Backend chưa được cấu hình NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      500
    );
  }

  const authorization = request.headers.get("authorization");

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    ...(authorization?.startsWith("Bearer ")
      ? { global: { headers: { Authorization: authorization } } }
      : {}),
  });
}
