import "server-only";

import { createClient } from "@supabase/supabase-js";
import { ApiException } from "@/lib/api/response";

export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiException(
      "Backend chưa được cấu hình SUPABASE_SERVICE_ROLE_KEY để quản trị mật khẩu.",
      500
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
