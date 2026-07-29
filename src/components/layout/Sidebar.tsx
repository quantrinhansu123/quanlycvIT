"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ban, ChevronDown, ChevronRight, Target } from "lucide-react";
import { NAV_ITEMS } from "@/constants/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
}

function routeMatches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
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
        "flex h-screen shrink-0 flex-col border-r border-gray-100 bg-white transition-all duration-200",
        collapsed ? "w-0 overflow-hidden lg:w-[76px]" : "w-[264px]"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sm">
          <Target className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-gray-900">Goal App</p>
            <p className="text-[11px] text-gray-400">Goal App</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActiveGroup = routeMatches(pathname, item.href);
            const isOpen = openGroup === item.label;
            const activeChildHref = item.children
              ?.filter((child) => !child.disabled && routeMatches(pathname, child.href))
              .sort((left, right) => right.href.length - left.href.length)[0]?.href;

            if (!item.children) {
              return (
                <li key={item.label}>
                  {item.disabled ? (
                    <div
                      aria-disabled="true"
                      title={`${item.label} chưa được xây dựng`}
                      className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-rose-50/60 hover:text-rose-500"
                    >
                      <span className="relative h-[18px] w-[18px] shrink-0">
                        <item.icon className="absolute inset-0 h-[18px] w-[18px] transition group-hover:scale-75 group-hover:opacity-0" />
                        <Ban className="absolute inset-0 h-[18px] w-[18px] scale-75 opacity-0 transition group-hover:scale-100 group-hover:opacity-100" />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50",
                        isActiveGroup && "bg-blue-600 text-white shadow-sm hover:bg-blue-600"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )}
                </li>
              );
            }

            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : item.label)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50",
                    isActiveGroup &&
                      !collapsed &&
                      "bg-slate-50 font-semibold text-gray-900 before:absolute before:-left-3 before:h-8 before:w-[3px] before:rounded-r-full before:bg-blue-600",
                    isActiveGroup && collapsed && "bg-blue-50"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActiveGroup && "text-blue-600"
                    )}
                  />
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
                {isOpen && !collapsed && (
                  <ul className="relative mt-1 flex flex-col gap-1 pl-4 before:absolute before:bottom-1 before:left-1 before:top-0 before:w-px before:bg-gray-200">
                    {item.children.map((child) => {
                      const isChildActive = activeChildHref === child.href;
                      return (
                        <li key={child.href}>
                          {child.disabled ? (
                            <div
                              aria-disabled="true"
                              title={`${child.label} chưa được xây dựng`}
                              className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-rose-50/60 hover:text-rose-500"
                            >
                              <span className="relative h-4 w-4 shrink-0">
                                <child.icon className="absolute inset-0 h-4 w-4 transition group-hover:scale-75 group-hover:opacity-0" />
                                <Ban className="absolute inset-0 h-4 w-4 scale-75 opacity-0 transition group-hover:scale-100 group-hover:opacity-100" />
                              </span>
                              <span className="truncate">{child.label}</span>
                            </div>
                          ) : (
                            <Link
                              href={child.href}
                              className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:bg-gray-50",
                                isChildActive &&
                                  "bg-blue-600 font-semibold text-white shadow-[0_5px_12px_rgba(37,99,235,0.24)] hover:bg-blue-600"
                              )}
                            >
                              <child.icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          )}
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
