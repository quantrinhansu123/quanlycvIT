"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SplitViewContextValue {
  maximized: boolean;
  toggleMaximized: () => void;
}

const SplitViewContext = createContext<SplitViewContextValue | null>(null);

export function useSplitView() {
  return useContext(SplitViewContext);
}

interface SplitViewShellProps {
  listSlot: ReactNode;
  children: ReactNode;
}

/**
 * Layout chia đôi màn hình: danh sách bên trái, chi tiết bên phải, mỗi bên cuộn độc lập.
 * Dưới breakpoint lg không đủ chỗ nên chỉ hiển thị chi tiết (danh sách ẩn).
 */
export function SplitViewShell({ listSlot, children }: SplitViewShellProps) {
  const [maximized, setMaximized] = useState(false);

  return (
    <SplitViewContext.Provider
      value={{ maximized, toggleMaximized: () => setMaximized((prev) => !prev) }}
    >
      <div className="flex h-full min-h-0 overflow-hidden">
        <div
          className={cn(
            "min-h-0 shrink-0 flex-col overflow-hidden border-r border-gray-200",
            maximized ? "hidden" : "hidden lg:flex lg:w-[380px] xl:w-[440px]"
          )}
        >
          {listSlot}
        </div>
        <div className="h-full min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </SplitViewContext.Provider>
  );
}
