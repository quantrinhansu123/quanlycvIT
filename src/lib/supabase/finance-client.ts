import { createClient } from "@supabase/supabase-js";
import type { ApiSupabaseClient } from "@/lib/supabase/api";

const MISSING_SCHEMA_CODES = new Set(["PGRST205", "PGRST204", "42P01"]);
const SCHEMA_CHECK_TTL_MS = 60_000;

let cachedClient: ApiSupabaseClient | null | undefined;
let schemaReady = false;
let schemaCheckedAt = 0;

/** Client server-side dùng service_role của Supabase TÀI CHÍNH. */
export function getFinanceSupabaseClient(): ApiSupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const url = process.env.FINANCE_SUPABASE_URL;
  const key = process.env.FINANCE_SUPABASE_SERVICE_ROLE_KEY;
  cachedClient = url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  return cachedClient;
}

/**
 * Kiểm tra schema tài chính đã sẵn sàng chưa. Trong lúc chờ chạy migration,
 * app tự dùng Supabase chính để trang thu chi không bị lỗi.
 */
async function isFinanceSchemaReady(client: ApiSupabaseClient): Promise<boolean> {
  if (Date.now() - schemaCheckedAt < SCHEMA_CHECK_TTL_MS) return schemaReady;
  const { error } = await client.from("thu_chi_danh_muc").select("id").limit(1);
  schemaReady = !error || !MISSING_SCHEMA_CODES.has(error.code ?? "");
  schemaCheckedAt = Date.now();
  return schemaReady;
}

/** Chạy thao tác tài chính trên project tài chính, fallback project chính khi chưa có bảng. */
export async function withFinanceClient<T>(
  fallback: ApiSupabaseClient,
  run: (client: ApiSupabaseClient) => Promise<T>
): Promise<T> {
  const finance = getFinanceSupabaseClient();
  if (!finance) return run(fallback);
  if (!(await isFinanceSchemaReady(finance))) return run(fallback);
  return run(finance);
}
