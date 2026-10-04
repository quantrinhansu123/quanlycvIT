import { cache } from "react";
import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { createServerSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import type { AccountRole } from "@/types/account";
import { measureApiTiming } from "@/lib/api/observability";
import { getCachedJwks } from "@/lib/supabase/jwks";

export interface RequestAccountAccess {
  id: string;
  employeeCode: string;
  role: AccountRole;
}

/** Hồ sơ tài khoản đủ để seed Header/Sidebar từ Server Component. */
export interface RequestAccountProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: AccountRole;
  position?: string;
  avatarUrl?: string;
  employeeCode: string;
}

export function assertManagerOrAdmin(access: RequestAccountAccess): void {
  if (access.role === "member") {
    throw new ApiException("Tài khoản nhân viên không có quyền thực hiện thao tác này.", 403);
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
const PROFILE_CACHE_TTL_MS = 30_000;

interface ProfileCacheEntry {
  profile: RequestAccountProfile;
  fetchedAt: number;
}

const profileCacheHolder = globalThis as typeof globalThis & {
  __requestAccountProfileCache?: Map<string, ProfileCacheEntry>;
};
const profileCache = (profileCacheHolder.__requestAccountProfileCache ??= new Map());

function readCachedProfile(authUserId: string): RequestAccountProfile | null {
  const entry = profileCache.get(authUserId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > PROFILE_CACHE_TTL_MS) {
    profileCache.delete(authUserId);
    return null;
  }
  return entry.profile;
}

function rememberProfile(authUserId: string, profile: RequestAccountProfile) {
  profileCache.set(authUserId, { profile, fetchedAt: Date.now() });
  if (profileCache.size <= 200) return;
  const oldest = profileCache.keys().next().value;
  if (oldest) profileCache.delete(oldest);
}

export async function resolveAuthUserId(supabase: ApiSupabaseClient): Promise<string | undefined> {
  const keys = await getCachedJwks();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
    supabase.bearerToken,
    keys.length > 0 ? { jwks: { keys } } : undefined
  );
  if (claimsError) return undefined;
  return typeof claimsData?.claims.sub === "string" ? claimsData.claims.sub : undefined;
}

async function loadActiveAccountProfile(
  supabase: ApiSupabaseClient,
  authUserId: string
): Promise<RequestAccountProfile | null> {
  const cached = readCachedProfile(authUserId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("tai_khoan")
    .select("id,ten_nv,username,email,role,chuc_vu,avatar_url,ma_nv,status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data || data.status !== "active") return null;

  const profile: RequestAccountProfile = {
    id: String(data.id),
    name: String(data.ten_nv),
    username: String(data.username ?? ""),
    email: String(data.email ?? ""),
    role: data.role as AccountRole,
    position: data.chuc_vu ?? undefined,
    avatarUrl: data.avatar_url ?? undefined,
    employeeCode: String(data.ma_nv),
  };
  rememberProfile(authUserId, profile);
  return profile;
}

async function fetchAccountProfile(
  supabase: ApiSupabaseClient
): Promise<RequestAccountProfile | null> {
  const authUserId = await resolveAuthUserId(supabase);
  if (!authUserId) return null;
  return loadActiveAccountProfile(supabase, authUserId);
}

/**
 * Hồ sơ phiên cookie — dedupe trong cùng request RSC (layout + page chỉ query 1 lần).
 */
export const getServerAccountProfile = cache(async (): Promise<RequestAccountProfile | null> => {
  const supabase = await createServerSupabaseClient();
  return fetchAccountProfile(supabase);
});

function profileToAccess(profile: RequestAccountProfile): RequestAccountAccess {
  return {
    id: profile.id,
    employeeCode: profile.employeeCode,
    role: profile.role,
  };
}

/** Tài khoản nội bộ đang gắn với phiên Supabase gửi lên API / Server Component. */
export async function requireRequestAccount(
  supabase: ApiSupabaseClient
): Promise<RequestAccountAccess> {
  return measureApiTiming("auth", async () => {
    // Server Component (cookie, không bearer): dùng cache request để tránh query trùng với layout.
    if (!supabase.bearerToken) {
      const profile = await getServerAccountProfile();
      if (!profile) {
        throw new ApiException("Bạn cần đăng nhập để xem dữ liệu công việc.", 401);
      }
      return profileToAccess(profile);
    }

    const authUserId = await resolveAuthUserId(supabase);
    if (!authUserId) {
      throw new ApiException("Bạn cần đăng nhập để xem dữ liệu công việc.", 401);
    }

    const profile = await loadActiveAccountProfile(supabase, authUserId);
    if (!profile) throw new ApiException("Không tìm thấy tài khoản nhân viên tương ứng.", 403);
    return profileToAccess(profile);
  });
}

/**
 * Đọc hồ sơ `tai_khoan` đầy đủ cho layout dashboard (SSR seed).
 * Trả `null` khi chưa đăng nhập / tài khoản không hợp lệ thay vì ném lỗi.
 */
export async function getRequestAccountProfile(
  supabase: ApiSupabaseClient
): Promise<RequestAccountProfile | null> {
  if (!supabase.bearerToken) {
    return getServerAccountProfile();
  }
  return fetchAccountProfile(supabase);
}

async function hasRelation(
  supabase: ApiSupabaseClient,
  table:
    | "du_an_thanh_vien"
    | "du_an_quan_ly"
    | "cong_viec_phu_trach"
    | "task_phu_trach"
    | "truc_nhat_ca_phu_trach",
  ownerColumn: "du_an_id" | "cong_viec_id" | "task_id" | "ca_id",
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

/** Thành viên chỉ được đánh dấu checklist của ca trực mà mình được phân công. */
export async function assertDutyShiftAssignee(
  supabase: ApiSupabaseClient,
  access: RequestAccountAccess,
  caId: string
): Promise<void> {
  if (access.role !== "member") return;
  const assigned = await hasRelation(supabase, "truc_nhat_ca_phu_trach", "ca_id", caId, access.id);
  if (!assigned) {
    throw new ApiException("Bạn chưa được phân công ca trực này.", 403);
  }
}
