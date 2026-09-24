import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCachedJwks } from "@/lib/supabase/jwks";

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

  const { pathname } = request.nextUrl;
  const hasSupabaseSessionCookie = request.cookies
    .getAll()
    .some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));

  // Skip JWKS loading and JWT parsing for requests that cannot have a Supabase session.
  // This keeps anonymous page loads local and avoids a network request to Supabase.
  if (!hasSupabaseSessionCookie) {
    if (isPublicPath(pathname)) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/dang-nhap", request.url));
  }

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

  // Truyền JWKS đã cache để getClaims xác thực JWT cục bộ, tránh fetch JWKS mỗi request.
  const keys = await getCachedJwks();
  const { data } = await supabase.auth.getClaims(
    undefined,
    keys.length > 0 ? { jwks: { keys } } : undefined
  );
  const isAuthenticated = Boolean(data?.claims);

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
