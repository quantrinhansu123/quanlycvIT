"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Clock,
  FileText,
  Home,
  Layers,
  Menu,
  PanelLeft,
  Palette,
} from "lucide-react";
import { BREADCRUMB_LABELS } from "@/constants/navigation";
import { Avatar } from "@/components/ui/Avatar";

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
  const isEmployeeDetail =
    segments.length === 2 && segments[0] === "nhan-vien";

  if (isProjectDetail) {
    return (
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
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
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
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
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
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
  const now = useNow();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const timeLabel = now
    ? now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const dateLabel = now
    ? `${WEEKDAYS[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(
        now.getMonth() + 1
      ).padStart(2, "0")}/${now.getFullYear()}`
    : "";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-100 bg-white px-4 sm:px-6">
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

      <div className="hidden items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-600 md:flex">
        <Clock className="h-4 w-4 text-gray-400" />
        <span className="font-medium">{timeLabel}</span>
      </div>
      <div className="hidden items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-600 lg:flex">
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
        className="hidden h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 sm:flex"
        aria-label="Giao diện"
      >
        <Palette className="h-5 w-5" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setUserMenuOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-gray-50"
        >
          <Avatar name="UP Edu Admin" color="#2563EB" size="md" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold text-gray-800">UP Edu Admin</span>
            <span className="block text-xs text-gray-400">Quản trị viên</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-12 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              Thông tin tài khoản
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
