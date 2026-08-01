import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { parseAccountInput } from "@/lib/api/account-validation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import { assertManagerOrAdmin, requireRequestAccount } from "@/lib/supabase/authorization";
import { deleteAccount, getAccount, updateAccount } from "@/lib/supabase/accounts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isDuplicateAuthEmail(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already") || normalized.includes("exists");
}

async function syncAuthEmail(authUserId: string, nextEmail: string) {
  const admin = createAdminSupabaseClient();
  const { data, error: getUserError } = await admin.auth.admin.getUserById(authUserId);
  if (getUserError || !data.user) {
    console.error("Cannot read linked Supabase Auth user:", getUserError);
    throw new ApiException("Không thể tìm thấy tài khoản xác thực được liên kết.", 409);
  }

  const previousEmail = data.user.email?.trim().toLowerCase();
  if (!previousEmail) {
    throw new ApiException("Tài khoản xác thực được liên kết chưa có email.", 409);
  }
  if (previousEmail === nextEmail) return null;

  const { error: updateEmailError } = await admin.auth.admin.updateUserById(authUserId, {
    email: nextEmail,
  });
  if (updateEmailError) {
    if (isDuplicateAuthEmail(updateEmailError.message)) {
      throw new ApiException("Email này đã được sử dụng bởi một tài khoản đăng nhập khác.", 409);
    }
    console.error("Cannot update Supabase Auth email:", updateEmailError);
    throw new ApiException("Không thể đồng bộ email đăng nhập trên Supabase Auth.", 502);
  }

  return async () => {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(authUserId, {
      email: previousEmail,
    });
    if (rollbackError) throw rollbackError;
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const account = await getAccount(supabase, id);
    if (!account) throw new ApiException("Không tìm thấy tài khoản.", 404);
    return apiSuccess(account);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const parsedInput = parseAccountInput(await readJsonObject(request));
    const input = {
      ...parsedInput,
      email: parsedInput.email?.toLowerCase(),
    };
    const existingAccount = await getAccount(supabase, id);
    if (!existingAccount) throw new ApiException("Không tìm thấy tài khoản.", 404);
    if (existingAccount.authUserId && !input.email) {
      throw new ApiException(
        "Không thể xóa email của tài khoản đã được liên kết đăng nhập.",
        400
      );
    }

    const rollbackAuthEmail =
      existingAccount.authUserId && input.email
        ? await syncAuthEmail(existingAccount.authUserId, input.email)
        : null;

    try {
      const account = await updateAccount(supabase, id, input);
      if (!account) throw new ApiException("Không tìm thấy tài khoản.", 404);
      return apiSuccess(account, 200, "Cập nhật tài khoản thành công.");
    } catch (updateError) {
      if (rollbackAuthEmail) {
        try {
          await rollbackAuthEmail();
        } catch (rollbackError) {
          console.error("Cannot roll back Supabase Auth email:", rollbackError);
          throw new ApiException(
            "Cập nhật thất bại và không thể hoàn tác email đăng nhập. Vui lòng kiểm tra lại tài khoản.",
            500
          );
        }
      }
      throw updateError;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createApiSupabaseClient(request);
    assertManagerOrAdmin(await requireRequestAccount(supabase));
    const deleted = await deleteAccount(supabase, id);
    if (!deleted) throw new ApiException("Không tìm thấy tài khoản.", 404);
    return apiSuccess(true, 200, "Xóa tài khoản thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
