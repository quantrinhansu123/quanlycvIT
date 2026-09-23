"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ban, ChevronDown, ChevronRight } from "lucide-react";
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink";
import { NAV_ITEMS } from "@/constants/navigation";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";

interface SidebarProps {
  collapsed: boolean;
  /** rail: desktop (ẩn dưới lg). drawer: luôn hiện trong overlay mobile. */
  variant?: "rail" | "drawer";
}

function routeMatches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed, variant = "rail" }: SidebarProps) {
  const pathname = usePathname();
  const { account } = useCurrentAccount();
  const activeGroupLabel =
    NAV_ITEMS.find((item) => item.children && routeMatches(pathname, item.href))?.label ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const activeGroup = NAV_ITEMS.find(
      (item) => item.children && routeMatches(pathname, item.href)
    );

    return activeGroup?.label ?? null;
  });
  const [activePath, setActivePath] = useState(pathname);

  if (activePath !== pathname) {
    setActivePath(pathname);
    if (activeGroupLabel) setOpenGroup(activeGroupLabel);
  }

  return (
    <aside
      className={cn(
        "h-full shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-white transition-[width] duration-200",
        variant === "drawer" ? "flex w-full" : "hidden lg:flex",
        variant === "rail" && (collapsed ? "w-0 lg:w-[76px]" : "w-[264px]")
      )}
    >
      <div className="flex h-16 items-center gap-2 px-5">
        <div
          className={cn(
            "flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100",
            collapsed ? "w-9" : "w-12"
          )}
        >
          <Image
            src="/logo-viet-nhat-ipt.webp"
            alt="Việt Nhật IPT"
            width={192}
            height={87}
            className="h-full w-full object-contain px-1 py-1.5"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-gray-900">IT Việt Nhật</p>
            <p className="truncate text-[11px] text-gray-400">Trang Quản Trị</p>
          </div>
        )}
      </div>

      <nav className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const forbiddenForMember = account?.role === "member" && item.href === "/nhan-vien";
            const isActiveGroup = routeMatches(pathname, item.href);
            const isOpen = openGroup === item.label;
            const activeChildHref = item.children
              ?.filter((child) => routeMatches(pathname, child.href))
              .sort((left, right) => right.href.length - left.href.length)[0]?.href;

            if (!item.children) {
              return (
                <li key={item.label}>
                  <IntentPrefetchLink
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50",
                      isActiveGroup && "bg-brand-600 text-white shadow-sm hover:bg-brand-600"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </IntentPrefetchLink>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    if (!forbiddenForMember) setOpenGroup(isOpen ? null : item.label);
                  }}
                  aria-disabled={forbiddenForMember}
                  title={forbiddenForMember ? "Bạn không có quyền truy cập mục Nhân viên" : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50",
                    forbiddenForMember && "cursor-not-allowed hover:bg-rose-50 hover:text-rose-600",
                    isActiveGroup &&
                      !collapsed &&
                      "bg-slate-50 font-semibold text-gray-900 before:absolute before:left-0 before:h-8 before:w-[3px] before:rounded-r-full before:bg-brand-600",
                    isActiveGroup && collapsed && "bg-brand-50"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      forbiddenForMember && "group-hover:hidden",
                      isActiveGroup && "text-brand-600"
                    )}
                  />
                  {forbiddenForMember && <Ban className="hidden h-[18px] w-[18px] shrink-0 text-rose-600 group-hover:block" />}
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </>
                  )}
                </button>
                {isOpen && !collapsed && !forbiddenForMember && (
                  <ul className="relative mt-1 flex flex-col gap-1 pl-4 before:absolute before:bottom-1 before:left-1 before:top-0 before:w-px before:bg-gray-200">
                    {item.children
                      .filter(
                        (child) =>
                          !(child.href === "/truc-nhat/cau-hinh" && account?.role === "member")
                      )
                      .map((child) => {
                      const isChildActive = activeChildHref === child.href;
                      return (
                        <li key={child.href}>
                          <IntentPrefetchLink
                            href={child.href}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:bg-brand-50",
                              isChildActive &&
                                "bg-brand-600 font-semibold text-white shadow-[0_5px_12px_rgba(209,18,42,0.24)] hover:bg-brand-600"
                            )}
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </IntentPrefetchLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

    </aside>
  );
}
