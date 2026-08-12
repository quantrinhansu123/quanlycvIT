import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import type { AccountRole } from "@/types/account";
import { measureApiTiming } from "@/lib/api/observability";

export interface RequestAccountAccess {
  id: string;
  employeeCode: string;
  role: AccountRole;
}

export function assertManagerOrAdmin(access: RequestAccountAccess): void {
  if (access.role === "member") {
    throw new ApiException("Tài khoản nhân viên không có quyền thực hiện thao tác này.", 403);
  }
}

interface CachedJwk {
  kty: string;
  key_ops: string[];
  kid?: string;
  [key: string]: unknown;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { keys: CachedJwk[]; fetchedAt: number } | null = null;

/**
 * Bộ khoá công khai (JWKS) của Supabase Auth, cache trong bộ nhớ tiến trình.
 * `createApiSupabaseClient` tạo 1 client Supabase mới mỗi request nên tự
 * `getClaims()` không có gì để cache giữa các request — hàm này bù lại phần đó
 * để việc xác thực JWT không phải gọi mạng lại mỗi lần (xem
 * `agents/PERF-LOGIN-PAGELOAD-OPTIMIZATION-README.md`, giai đoạn 1).
 */
async function loadJwks(): Promise<CachedJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return jwksCache?.keys ?? [];

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!response.ok) return jwksCache?.keys ?? [];
    const json = (await response.json()) as { keys?: CachedJwk[] };
    jwksCache = { keys: json.keys ?? [], fetchedAt: Date.now() };
    return jwksCache.keys;
  } catch {
    return jwksCache?.keys ?? [];
  }
}

/**
 * Xác thực JWT của request hiện tại cục bộ (`getClaims`, có cache JWKS) và trả về
 * `auth_user_id` (`claims.sub`). Dùng chung cho `requireRequestAccount` và
 * `assertAdminAccount` (`data.ts`) để tránh mỗi nơi tự gọi `getUser()` (network).
 *
 * `supabase.bearerToken` chỉ tồn tại trên client tạo bởi `createApiSupabaseClient`
 * (route handler, xác thực qua header `Authorization`). Với client tạo bởi
 * `createServerSupabaseClient` (Server Component, xác thực qua cookie), truyền
 * `undefined` cho `getClaims` để nó tự lấy access token từ phiên trong cookie.
 */
export async function resolveAuthUserId(supabase: ApiSupabaseClient): Promise<string | undefined> {
  const keys = await loadJwks();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
    supabase.bearerToken,
    keys.length > 0 ? { jwks: { keys } } : undefined
  );
  if (claimsError) return undefined;
  return typeof claimsData?.claims.sub === "string" ? claimsData.claims.sub : undefined;
}

/** Tài khoản nội bộ đang gắn với phiên Supabase gửi lên API. */
export async function requireRequestAccount(
  supabase: ApiSupabaseClient
): Promise<RequestAccountAccess> {
  return measureApiTiming("auth", async () => {
    const authUserId = await resolveAuthUserId(supabase);
    if (!authUserId) {
      throw new ApiException("Bạn cần đăng nhập để xem dữ liệu công việc.", 401);
    }

    const { data, error } = await supabase
      .from("tai_khoan")
      .select("id,ma_nv,role,status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    throwDatabaseError(error);
    if (!data) throw new ApiException("Không tìm thấy tài khoản nhân viên tương ứng.", 403);
    if (data.status !== "active") throw new ApiException("Tài khoản này đang bị khóa.", 403);

    return {
      id: data.id as string,
      employeeCode: data.ma_nv as string,
      role: data.role as AccountRole,
    };
  });
}

async function hasRelation(
  supabase: ApiSupabaseClient,
  table: "du_an_thanh_vien" | "du_an_quan_ly" | "cong_viec_phu_trach" | "task_phu_trach",
  ownerColumn: "du_an_id" | "cong_viec_id" | "task_id",
  ownerId: string,
  accountId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select(ownerColumn)
    .eq(ownerColumn, ownerId)
    .eq("tai_khoan_id", accountId)
    .maybeSingle();
  throwDatabaseError(error);
  return Boolean(data);
}

/** Thành viên chỉ được mở dự án mà mình tham gia hoặc được giao quản lý. */
export async function assertProjectReadable(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess,
  projectId: string
): Promise<void> {
  if (access.role !== "member") return;
  const [member, manager, legacy] = await Promise.all([
    hasRelation(supabase, "du_an_thanh_vien", "du_an_id", projectId, access.id),
    hasRelation(supabase, "du_an_quan_ly", "du_an_id", projectId, access.id),
    supabase.from("du_an").select("id").eq("id", projectId).eq("nguoi_ql_id", access.id).maybeSingle(),
  ]);
  throwDatabaseError(legacy.error);
  if (!member && !manager && !legacy.data) {
    throw new ApiException("Không tìm thấy dự án hoặc bạn chưa được phân công vào dự án này.", 404);
  }
}

/** Thành viên chỉ được mở công việc mà mình là một trong các người phụ trách. */
export async function assertWorkTaskReadable(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess,
  workTaskId: string
): Promise<void> {
  if (access.role !== "member") return;
  const [assigned, legacy] = await Promise.all([
    hasRelation(supabase, "cong_viec_phu_trach", "cong_viec_id", workTaskId, access.id),
    supabase.from("cong_viec").select("id").eq("id", workTaskId).eq("nguoi_phu_trach_id", access.id).maybeSingle(),
  ]);
  throwDatabaseError(legacy.error);
  if (!assigned && !legacy.data) {
    throw new ApiException("Không tìm thấy công việc hoặc bạn chưa được phân công công việc này.", 404);
  }
}

/** Thành viên chỉ được mở task mà mình là một trong các người thực hiện. */
export async function assertSubtaskReadable(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess,
  subtaskId: string
): Promise<void> {
  if (access.role !== "member") return;
  const [assigned, legacy, testing] = await Promise.all([
    hasRelation(supabase, "task_phu_trach", "task_id", subtaskId, access.id),
    supabase.from("task").select("id").eq("id", subtaskId).eq("nguoi_phu_trach_id", access.id).maybeSingle(),
    supabase.from("task").select("id").eq("id", subtaskId).eq("nguoi_test_id", access.id).maybeSingle(),
  ]);
  throwDatabaseError(legacy.error);
  throwDatabaseError(testing.error);
  if (!assigned && !legacy.data && !testing.data) {
    throw new ApiException("Không tìm thấy task hoặc bạn chưa được phân công task này.", 404);
  }
}
