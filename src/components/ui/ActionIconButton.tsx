"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionIconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "default" | "warning" | "danger";
  disabled?: boolean;
}

export function ActionIconButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  disabled = false,
}: ActionIconButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  function showTooltip() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const estimatedHalfWidth = Math.min(
      140,
      Math.max(44, label.length * 4)
    );
    setTooltipPosition({
      top: rect.top - 8,
      left: Math.min(
        window.innerWidth - estimatedHalfWidth - 8,
        Math.max(estimatedHalfWidth + 8, rect.left + rect.width / 2)
      ),
    });
  }

  useEffect(() => {
    if (!tooltipPosition) return;
    const hideTooltip = () => setTooltipPosition(null);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [tooltipPosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltipPosition(null)}
        disabled={disabled}
        title={label}
        aria-label={label}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40",
          tone === "danger"
            ? "border-rose-100 text-rose-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            : tone === "warning"
              ? "border-amber-100 text-amber-600 hover:border-amber-200 hover:bg-amber-50"
              : "border-gray-200 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>

      {tooltipPosition &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
