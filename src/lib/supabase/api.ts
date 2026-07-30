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

/**
 * Client publishable dùng trong Server Component, không gắn Request/Authorization.
 * Chỉ an toàn trong cửa sổ RLS-anon hiện tại (mọi bảng cho phép role anon đọc tự do).
 * Khi bật RLS thật theo người dùng đăng nhập, cần thay bằng @supabase/ssr
 * (createServerClient + cookie-based session).
 */
export function createServerSupabaseClient(): ApiSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new ApiException(
      "Backend chưa được cấu hình NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      500
    );
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
