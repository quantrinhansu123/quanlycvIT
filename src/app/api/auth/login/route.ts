import { ApiException, apiSuccess, handleApiError, readJsonObject } from "@/lib/api/response";
import { measureApiTiming } from "@/lib/api/observability";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/api";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const normalizedIdentifier = identifier.toLowerCase();
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
    const { data: account, error: accountError } = await measureApiTiming("db", async () =>
      identifier.includes("@")
        ? await accountQuery.eq("email", normalizedIdentifier).maybeSingle()
        : await accountQuery.eq("username", normalizedIdentifier).maybeSingle()
    );

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

    // Ký trực tiếp trên client SSR gắn cookie (thay vì client tạm `persistSession:false`
    // rồi trả token về cho trình duyệt gọi lại `setSession()`) — `setSession()` khi token
    // còn hạn sẽ tự gọi `_getUser()` (thêm 1 network round-trip tới Supabase Auth server)
    // để xác thực lại, dù server vừa xác thực xong. Ký ở đây, cookie phiên được ghi thẳng
    // vào response (Route Handler được phép ghi cookie) — bỏ hẳn round-trip thừa đó.
    const authClient = await createServerSupabaseClient();
    const { data: signInData, error: signInError } = await measureApiTiming("auth", () =>
      authClient.auth.signInWithPassword({ email: account.email!, password })
    );

    if (signInError || !signInData.session) {
      if (signInError?.message.toLowerCase().includes("email not confirmed")) {
        throw new ApiException("Email của tài khoản chưa được xác nhận.", 403);
      }
      if (signInError?.status === 429) {
        throw new ApiException("Bạn đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.", 429);
      }
      throw new ApiException("Mật khẩu không đúng. Vui lòng kiểm tra và nhập lại.", 401);
    }

    return apiSuccess<{ ok: true }>({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
