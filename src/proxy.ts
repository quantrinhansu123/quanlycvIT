import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Route công khai, không cần đăng nhập. */
const PUBLIC_PATHS = ["/dang-nhap"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Đồng bộ/làm mới cookie Supabase và chặn truy cập khi chưa đăng nhập. */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Không bỏ lệnh này: getClaims kích hoạt kiểm tra/làm mới JWT khi cần,
  // đồng thời cho biết đã đăng nhập hay chưa mà không cần gọi mạng thêm lần nữa.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/dang-nhap", request.url));
  }

  if (isAuthenticated && isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAuthenticated && (pathname === "/nhan-vien" || pathname.startsWith("/nhan-vien/"))) {
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : undefined;
    if (userId) {
      const { data: account } = await supabase
        .from("tai_khoan")
        .select("role")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (account?.role === "member") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
