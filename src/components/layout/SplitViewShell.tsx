"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface SplitViewContextValue {
  maximized: boolean;
  detailOpen: boolean;
  detailCollapsed: boolean;
  openDetail: () => void;
  toggleDetailCollapsed: () => void;
  toggleMaximized: () => void;
}

const SplitViewContext = createContext<SplitViewContextValue | null>(null);

export function useSplitView() {
  return useContext(SplitViewContext);
}

interface SplitViewShellProps {
  listSlot: ReactNode;
  children: ReactNode;
  detailOpen?: boolean;
  detailKey?: string;
}

/**
 * Layout chia đôi màn hình: danh sách bên trái, chi tiết bên phải, mỗi bên cuộn độc lập.
 * Dưới breakpoint lg không đủ chỗ nên chỉ hiển thị chi tiết (danh sách ẩn).
 * Khi mở chi tiết, cột danh sách thu hẹp để ưu tiên nội dung bên phải.
 */
export function SplitViewShell({ listSlot, children, detailOpen = true, detailKey }: SplitViewShellProps) {
  const [maximized, setMaximized] = useState(false);
  const [detailState, setDetailState] = useState({ key: detailKey, collapsed: false });
  const detailCollapsed = detailState.key === detailKey && detailState.collapsed;

  function setDetailCollapsed(collapsed: boolean) {
    setDetailState({ key: detailKey, collapsed });
  }

  return (
    <SplitViewContext.Provider
      value={{
        maximized,
        detailOpen,
        detailCollapsed,
        openDetail: () => setDetailCollapsed(false),
        toggleDetailCollapsed: () => setDetailCollapsed(!detailCollapsed),
        toggleMaximized: () => {
          setDetailCollapsed(false);
          setMaximized((prev) => !prev);
        },
      }}
    >
      <div className="flex h-full min-h-0 overflow-hidden">
        <div
          className={cn(
            "min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-r border-gray-200",
            !detailOpen
              ? "flex w-full"
              : maximized
              ? "hidden"
              : detailCollapsed
                ? "hidden lg:flex lg:flex-1"
                : "hidden lg:flex lg:w-[300px] xl:w-[340px]"
          )}
        >
          {listSlot}
        </div>
        <div
          className={cn(
            "@container/detail h-full min-h-0 min-w-0 flex-1 overflow-y-auto",
            !detailOpen ? "hidden" : detailCollapsed && "lg:hidden"
          )}
        >
          {children}
        </div>
        {detailOpen && detailCollapsed && !maximized && (
          <div className="hidden h-full shrink-0 items-start border-l border-gray-200 bg-white px-2 pt-3 lg:flex">
            <button
              type="button"
              onClick={() => setDetailCollapsed(false)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
              aria-label="Mở panel chi tiết"
              title="Mở panel chi tiết"
            >
              <PanelRightOpen className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </SplitViewContext.Provider>
  );
}
