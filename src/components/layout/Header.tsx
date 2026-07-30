"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  Bell,
  ChevronDown,
  Clock,
  FileText,
  Home,
  Layers,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  Palette,
  RotateCcw,
  Sun,
  UserCircle,
  X,
} from "lucide-react";
import { BREADCRUMB_LABELS } from "@/constants/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";

const WEEKDAYS = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
];

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
}

interface HeaderAccount {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "admin" | "manager" | "member";
  position?: string;
  avatarUrl?: string;
}

type ThemeMode = "light" | "dark" | "system";

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const isProjectDetail =
    segments.length === 3 &&
    segments[0] === "quan-ly-cong-viec" &&
    segments[1] === "danh-sach-du-an";
  const isTaskDetail =
    segments.length === 3 &&
    segments[0] === "quan-ly-cong-viec" &&
    (segments[1] === "danh-sach-cong-viec" ||
      segments[1] === "danh-sach-task");
  const isAccountManagement = pathname === "/nhan-vien";
  const employeeModuleSegments = new Set([
    "phong-ban-chuc-vu",
    "thong-ke-nhan-su",
    "so-do-to-chuc",
    "phan-quyen",
  ]);
  const isEmployeeDetail =
    segments.length === 2 &&
    segments[0] === "nhan-vien" &&
    !employeeModuleSegments.has(segments[1]);

  if (isProjectDetail) {
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
        <Link
          href="/quan-ly-cong-viec"
          className="flex shrink-0 items-center gap-1.5 hover:text-gray-700"
        >
          <Layers className="h-4 w-4" />
          <span>Quản lý công việc</span>
        </Link>
        <span className="text-gray-300">&gt;</span>
        <Link
          href="/quan-ly-cong-viec/danh-sach-du-an"
          className="flex shrink-0 items-center gap-1.5 hover:text-gray-700"
        >
          <Layers className="h-4 w-4" />
          <span>Danh sách dự án</span>
        </Link>
        <span className="text-gray-300">&gt;</span>
        <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-gray-900">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">Chi tiết dự án</span>
        </span>
      </nav>
    );
  }

  if (isAccountManagement) {
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
        <Link href="/" className="flex items-center text-gray-400 hover:text-gray-600">
          <Home className="h-4 w-4" />
        </Link>
        <span className="text-gray-300">&gt;</span>
        <Link href="/nhan-vien" className="truncate hover:text-gray-700">
          Nhân viên
        </Link>
        <span className="text-gray-300">&gt;</span>
        <span className="truncate font-semibold text-gray-900">
          Quản lý tài khoản
        </span>
      </nav>
    );
  }

  if (isEmployeeDetail) {
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
        <Link href="/" className="flex shrink-0 items-center text-gray-400 hover:text-gray-600">
          <Home className="h-4 w-4" />
        </Link>
        <span className="text-gray-300">&gt;</span>
        <Link href="/nhan-vien" className="shrink-0 hover:text-gray-700">
          Nhân viên
        </Link>
        <span className="text-gray-300">&gt;</span>
        <Link href="/nhan-vien" className="shrink-0 hover:text-gray-700">
          Quản lý tài khoản
        </Link>
        <span className="text-gray-300">&gt;</span>
        <span className="truncate font-semibold text-gray-900">
          Chi tiết nhân viên
        </span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
      <Link href="/" className="flex items-center text-gray-400 hover:text-gray-600">
        <Home className="h-4 w-4" />
      </Link>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label =
          isTaskDetail && isLast
            ? "Chi tiết"
            : BREADCRUMB_LABELS[segment] ?? segment;
        return (
          <span key={href} className="flex min-w-0 items-center gap-2">
            <span className="text-gray-300">&gt;</span>
            {isLast ? (
              <span className="truncate font-semibold text-gray-800">{label}</span>
            ) : (
              <Link href={href} className="truncate hover:text-gray-700">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function Header({ onToggleSidebar, onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const now = useNow();
  const [account, setAccount] = useState<HeaderAccount | null>(null);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem("goal-app:theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });

  useEffect(() => {
    applyTheme(themeMode);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (themeMode === "system") applyTheme("system");
    };
    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, [themeMode]);

  useEffect(() => {
    if (!themePanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemePanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [themePanelOpen]);

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    window.localStorage.setItem("goal-app:theme", mode);
  };

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const loadAccount = async (userId?: string) => {
      if (!userId) {
        if (active) setAccount(null);
        return;
      }
      const { data } = await supabase
        .from("tai_khoan")
        .select("id,ten_nv,username,email,role,chuc_vu,avatar_url")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (!active || !data) return;
      setAccount({
        id: String(data.id),
        name: String(data.ten_nv),
        username: String(data.username ?? ""),
        email: String(data.email ?? ""),
        role: data.role as HeaderAccount["role"],
        position: data.chuc_vu ?? undefined,
        avatarUrl: data.avatar_url ?? undefined,
      });
    };

    void supabase.auth
      .getUser()
      .then((result: { data: { user: User | null } }) => loadAccount(result.data.user?.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      void loadAccount(session?.user.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/dang-nhap");
    router.refresh();
  };

  const roleLabel =
    account?.role === "admin"
      ? "Quản trị viên"
      : account?.role === "manager"
        ? "Quản lý"
        : "Nhân viên";

  const timeLabel = now
    ? now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dateLabel = now
    ? `${WEEKDAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(
        now.getMonth() + 1
      ).padStart(2, "0")}/${now.getFullYear()}`
    : "";

  return (
    <>
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-gray-100 bg-white px-4 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        className="hidden h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:flex"
        aria-label="Thu gọn menu"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      <div className="hidden items-center gap-1.5 px-2 py-1 text-xs text-gray-600 md:flex">
        <Clock className="h-3.5 w-3.5 text-gray-400" />
        <span className="font-medium">{timeLabel}</span>
      </div>
      <div className="hidden items-center gap-1.5 px-2 py-1 text-xs text-gray-600 lg:flex">
        <span className="font-medium">{dateLabel}</span>
      </div>

      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        aria-label="Thông báo"
      >
        <Bell className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setThemePanelOpen(true);
        }}
        className="hidden h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 sm:flex"
        aria-label="Giao diện"
      >
        <Palette className="h-[18px] w-[18px]" />
      </button>

      <div className="group relative">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-gray-50"
          aria-label="Mở menu tài khoản"
          aria-haspopup="menu"
        >
          <Avatar
            name={account?.name ?? "Quản trị viên"}
            color="#2563EB"
            imageUrl={account?.avatarUrl}
            size="md"
          />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-32 truncate text-xs font-semibold text-gray-800">
              {account?.name ?? "Quản trị viên"}
            </span>
            <span className="block text-[10px] text-gray-400">{roleLabel}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </button>
        <div
          className="account-menu invisible pointer-events-none absolute right-0 top-12 z-50 w-64 translate-y-1 overflow-hidden rounded-xl border border-gray-100 bg-white opacity-0 shadow-xl transition-all group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100"
          role="menu"
        >
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="truncate text-xs font-semibold text-gray-900">
                {account?.name ?? "Quản trị viên"}
              </p>
              <p className="mt-1 truncate text-[11px] text-gray-500">
                @{account?.username || "admin"} · {roleLabel}
              </p>
              {account?.email && (
                <p className="mt-0.5 truncate text-[10px] text-gray-400">{account.email}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                router.push(account ? `/nhan-vien/${account.id}` : "/nhan-vien");
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-600"
              role="menuitem"
            >
              <UserCircle className="h-4 w-4" />
              Hồ sơ
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 border-t border-gray-100 px-4 py-2.5 text-left text-xs text-rose-600 transition-colors hover:bg-rose-50"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
        </div>
      </div>
    </header>
    {themePanelOpen && (
      <div
        className="account-overlay fixed inset-0 z-[70] flex justify-end bg-slate-950/25"
        role="presentation"
        onMouseDown={() => setThemePanelOpen(false)}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="theme-panel-title"
          className="account-drawer h-full w-full max-w-[520px] border-l border-gray-200 bg-white shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
            <div>
              <h2 id="theme-panel-title" className="text-base font-semibold text-gray-900">
                Cài đặt giao diện
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Tùy chỉnh màu sắc và chế độ hiển thị cho ứng dụng
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeTheme("system")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Đặt lại giao diện"
                title="Đặt lại theo hệ thống"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setThemePanelOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Đóng cài đặt giao diện"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Monitor className="h-4 w-4" />
              Chế độ giao diện
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1">
              {([
                { value: "light" as const, label: "Sáng", icon: Sun },
                { value: "dark" as const, label: "Tối", icon: Moon },
                { value: "system" as const, label: "Hệ thống", icon: Monitor },
              ]).map((option) => {
                const Icon = option.icon;
                const active = themeMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => changeTheme(option.value)}
                    aria-pressed={active}
                    className={`flex h-10 items-center justify-center gap-2 rounded-[10px] border text-sm transition-all ${
                      active
                        ? "border-gray-200 bg-white font-medium text-gray-900 shadow-sm"
                        : "border-transparent text-gray-600 hover:bg-white/70 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              Chọn chế độ sáng, tối hoặc tự động theo cài đặt của thiết bị.
            </p>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
