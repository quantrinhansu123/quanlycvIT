import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  email: string
) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLocaleLowerCase() === email.toLocaleLowerCase()
    );
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJsonObject(request);
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 6) {
      throw new ApiException("Mật khẩu mới phải có ít nhất 6 ký tự.", 400);
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      throw new ApiException("Mật khẩu mới không được vượt quá 72 byte.", 400);
    }

    const admin = createAdminSupabaseClient();
    const { data: account, error: accountError } = await admin
      .from("tai_khoan")
      .select("id,auth_user_id,email")
      .eq("id", id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new ApiException("Không tìm thấy tài khoản nhân viên.", 404);
    if (!account.email) {
      throw new ApiException("Tài khoản chưa có email đăng nhập.", 400);
    }

    let authUserId = account.auth_user_id as string | null;
    if (!authUserId) {
      const existingUser = await findAuthUserByEmail(admin, account.email);
      if (existingUser) {
        authUserId = existingUser.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: account.email,
          password: newPassword,
          email_confirm: true,
          user_metadata: { employee_account_id: account.id },
        });
        if (error) throw error;
        authUserId = data.user.id;
      }

      const { error: linkError } = await admin
        .from("tai_khoan")
        .update({ auth_user_id: authUserId })
        .eq("id", account.id);
      if (linkError) throw linkError;
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      authUserId,
      { password: newPassword }
    );
    if (updateError) throw updateError;

    return apiSuccess(true, 200, "Đổi mật khẩu thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
