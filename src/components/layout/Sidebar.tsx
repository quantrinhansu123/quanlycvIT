"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import { NAV_ITEMS } from "@/constants/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    const activeGroup = NAV_ITEMS.find(
      (item) => item.children && pathname.startsWith(item.href)
    );

    return activeGroup?.label ?? null;
  });

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
            const isActiveGroup = item.children
              ? pathname.startsWith(item.href)
              : pathname === item.href;
            const isOpen = openGroup === item.label;

            if (!item.children) {
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50",
                      isActiveGroup && "bg-blue-50 text-blue-600"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
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
                      "bg-gray-50 text-gray-900 before:absolute before:-left-3 before:h-7 before:w-0.5 before:rounded-full before:bg-blue-600"
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
                      const isChildActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50",
                              isChildActive && "bg-blue-600 text-white shadow-sm hover:bg-blue-600"
                            )}
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </Link>
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

      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
            U
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold text-gray-800">UP Edu</p>
              <p className="text-[11px] text-gray-400">ĐN: UPEDU</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
