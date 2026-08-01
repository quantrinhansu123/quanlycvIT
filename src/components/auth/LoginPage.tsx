"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Archive,
  BookOpen,
  CalendarClock,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Palette,
  PanelsTopLeft,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MODULES = [
  {
    title: "Nhân viên",
    description: "Thống kê nhân sự, tài khoản, phòng ban, chức vụ và phân quyền",
    icon: Users,
  },
  {
    title: "Quản lý công",
    description: "Chấm công, thống kê công, duyệt công, nghỉ phép và ngày lễ",
    icon: CalendarClock,
  },
  {
    title: "Quản lý công việc",
    description: "Dự án, danh sách công việc và danh sách Task",
    icon: PanelsTopLeft,
  },
  {
    title: "Quản lý tài sản",
    description: "Loại tài sản, hồ sơ, cấp phát, thu hồi, kiểm kê và bảo trì",
    icon: Archive,
  },
  {
    title: "Tài liệu",
    description: "Danh sách tài liệu và luồng nghiệp vụ dùng chung",
    icon: BookOpen,
  },
  {
    title: "Hệ thống",
    description: "Thiết bị đăng nhập, phiên bản, nhật ký và cấu hình hệ thống",
    icon: Settings,
  },
] as const;

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("goal-app:theme") ?? "system";
    const resolvedTheme =
      storedTheme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : storedTheme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("goal-app:theme", nextTheme);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: email.trim(),
          password,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        data?: { accessToken: string; refreshToken: string };
      };
      if (!response.ok || !result.success || !result.data) {
        setError(result.message ?? `Đăng nhập thất bại (mã lỗi ${response.status}).`);
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.data.accessToken,
        refresh_token: result.data.refreshToken,
      });
      if (sessionError) {
        setError("Đăng nhập thành công nhưng không thể lưu phiên làm việc.");
        return;
      }

      if (remember) {
        window.localStorage.setItem("goal-app:remember-login", "true");
      } else {
        window.localStorage.removeItem("goal-app:remember-login");
      }

      router.replace("/");
      router.refresh();
    } catch (signInError) {
      setError(
        signInError instanceof TypeError
          ? "Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền."
          : "Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page min-h-screen bg-white text-gray-900">
      <div className="grid min-h-screen lg:grid-cols-[55%_45%]">
        <section className="login-intro relative hidden overflow-hidden border-r border-brand-100 px-8 py-8 lg:flex xl:px-14 xl:py-10">
          <div className="login-grid absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative z-10 mx-auto flex w-full max-w-[900px] flex-col">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-brand-500/25 ring-1 ring-brand-100">
                <Image
                  src="/logo-viet-nhat-ipt.webp"
                  alt="Việt Nhật IPT"
                  width={192}
                  height={87}
                  preload
                  className="h-full w-full object-contain p-1"
                />
              </span>
              <div>
                <p className="text-base font-bold tracking-tight text-gray-900">IT Việt Nhật</p>
                <p className="text-[11px] text-gray-500">Quản trị doanh nghiệp</p>
              </div>
            </div>

            <div className="my-auto py-10">
              <h1 className="max-w-[700px] text-[clamp(2rem,3.1vw,3.35rem)] font-bold leading-[1.16] tracking-[-0.035em] text-gray-950">
                Quản lý doanh nghiệp
                <span className="mt-1 block text-brand-600">tích hợp &amp; hiệu quả</span>
              </h1>
              <p className="mt-5 max-w-[740px] text-sm font-medium leading-6 text-gray-600 xl:text-[15px]">
                Nhân viên · Quản lý công · Quản lý công việc · Quản lý tài sản · Tài liệu ·
                Hệ thống — tất cả trong một nền tảng duy nhất.
              </p>

              <div className="mt-10 grid max-w-[760px] gap-4 xl:mt-12">
                {MODULES.map((module) => {
                  const Icon = module.icon;
                  return (
                    <div key={module.title} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/65 text-gray-500 shadow-sm">
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900">{module.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">
                          {module.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-gray-400">
              © {new Date().getFullYear()} IT Việt Nhật. All rights reserved.
            </p>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <button
            type="button"
            onClick={toggleTheme}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            aria-label="Đổi màu giao diện"
            title="Đổi màu giao diện"
          >
            <Palette className="h-[18px] w-[18px]" />
          </button>

          <div className="w-full max-w-[390px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-brand-100">
                <Image
                  src="/logo-viet-nhat-ipt.webp"
                  alt="Việt Nhật IPT"
                  width={192}
                  height={87}
                  className="h-full w-full object-contain p-1"
                />
              </span>
              <div>
                <p className="text-sm font-bold text-gray-900">IT Việt Nhật</p>
                <p className="text-[10px] text-gray-500">Quản trị doanh nghiệp</p>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-gray-950">Đăng nhập</h2>
              <p className="mt-1.5 text-xs text-gray-500">Chào mừng bạn quay trở lại IT Việt Nhật</p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-gray-600">
                  Tên đăng nhập
                </label>
                <div className="group relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand-600" />
                  <input
                    id="login-email"
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-[13px] font-medium text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                    placeholder="Nhập tên đăng nhập"
                    autoComplete="username"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-gray-600">
                  Mật khẩu
                </label>
                <div className="group relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand-600" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-[13px] font-medium text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-brand-600"
                />
                Ghi nhớ đăng nhập
              </label>

              {error && (
                <p
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-5 text-rose-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email.trim() || !password}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[13px] font-semibold text-white shadow-sm shadow-brand-600/20 transition-all hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>

            <div className="mt-12 border-t border-gray-100 pt-5 text-center">
              <p className="text-[10px] text-gray-400">
                © {new Date().getFullYear()} IT Việt Nhật
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
