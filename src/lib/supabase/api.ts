import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ApiException } from "@/lib/api/response";

/**
 * `bearerToken` giữ lại JWT gốc từ header `Authorization` để `requireRequestAccount`/
 * `assertAdminAccount` xác thực cục bộ bằng `getClaims()` thay vì gọi `getUser()`
 * (luôn tốn 1 network round-trip tới Supabase Auth server) — xem
 * `agents/PERF-LOGIN-PAGELOAD-OPTIMIZATION-README.md`. Tên khác `accessToken` vì
 * `SupabaseClient` đã có thuộc tính nội bộ `protected accessToken`.
 */
export type ApiSupabaseClient = SupabaseClient & { bearerToken?: string };

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
  const isBearer = authorization?.startsWith("Bearer ") ?? false;

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    ...(isBearer ? { global: { headers: { Authorization: authorization! } } } : {}),
  });

  return Object.assign(client, {
    bearerToken: isBearer ? authorization!.slice("Bearer ".length) : undefined,
  });
}

/** Tạo Supabase client cho Server Component từ phiên đăng nhập trong cookie. */
export async function createServerSupabaseClient(): Promise<ApiSupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new ApiException(
      "Backend chưa được cấu hình NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      500
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component chỉ đọc cookie; Proxy chịu trách nhiệm làm mới phiên.
        }
      },
    },
  });
}
