import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { ApiException, throwDatabaseError } from "@/lib/api/response";
import type { AccountRole } from "@/types/account";

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

/** Tài khoản nội bộ đang gắn với phiên Supabase gửi lên API. */
export async function requireRequestAccount(
  supabase: ApiSupabaseClient
): Promise<RequestAccountAccess> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new ApiException("Bạn cần đăng nhập để xem dữ liệu công việc.", 401);
  }

  const { data, error } = await supabase
    .from("tai_khoan")
    .select("id,ma_nv,role,status")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  throwDatabaseError(error);
  if (!data) throw new ApiException("Không tìm thấy tài khoản nhân viên tương ứng.", 403);
  if (data.status !== "active") throw new ApiException("Tài khoản này đang bị khóa.", 403);

  return {
    id: data.id as string,
    employeeCode: data.ma_nv as string,
    role: data.role as AccountRole,
  };
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
  const [assigned, legacy] = await Promise.all([
    hasRelation(supabase, "task_phu_trach", "task_id", subtaskId, access.id),
    supabase.from("task").select("id").eq("id", subtaskId).eq("nguoi_phu_trach_id", access.id).maybeSingle(),
  ]);
  throwDatabaseError(legacy.error);
  if (!assigned && !legacy.data) {
    throw new ApiException("Không tìm thấy task hoặc bạn chưa được phân công task này.", 404);
  }
}
