import { createClient } from "@supabase/supabase-js";
import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface LoginSession {
  accessToken: string;
  refreshToken: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!identifier) {
      throw new ApiException("Vui lòng nhập tên đăng nhập.", 400);
    }
    if (!password) {
      throw new ApiException("Vui lòng nhập mật khẩu.", 400);
    }

    const admin = createAdminSupabaseClient();
    const accountQuery = admin
      .from("tai_khoan")
      .select("id,username,email,role,status,auth_user_id");
    const { data: account, error: accountError } = identifier.includes("@")
      ? await accountQuery.ilike("email", identifier).maybeSingle()
      : await accountQuery.ilike("username", identifier).maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      throw new ApiException(`Không tìm thấy tài khoản “${identifier}”.`, 404);
    }
    if (account.status !== "active") {
      throw new ApiException("Tài khoản này đang bị khóa. Vui lòng liên hệ quản trị viên.", 403);
    }
    if (!account.email || !account.auth_user_id) {
      throw new ApiException("Tài khoản chưa được cấu hình thông tin đăng nhập.", 409);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) {
      throw new ApiException("Hệ thống xác thực chưa được cấu hình.", 500);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error: signInError } = await authClient.auth.signInWithPassword({
      email: account.email,
      password,
    });

    if (signInError || !data.session) {
      if (signInError?.message.toLowerCase().includes("email not confirmed")) {
        throw new ApiException("Email của tài khoản chưa được xác nhận.", 403);
      }
      if (signInError?.status === 429) {
        throw new ApiException("Bạn đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.", 429);
      }
      throw new ApiException("Mật khẩu không đúng. Vui lòng kiểm tra và nhập lại.", 401);
    }

    return apiSuccess<LoginSession>({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
