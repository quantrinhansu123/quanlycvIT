import { cn } from "@/lib/utils";
import type { ProjectColor } from "@/types/project";

const COLOR_CLASSES: Record<ProjectColor, string> = {
  purple: "bg-violet-50 text-violet-600 ring-violet-200",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  orange: "bg-amber-50 text-amber-600 ring-amber-200",
  red: "bg-rose-50 text-rose-600 ring-rose-200",
  blue: "bg-sky-50 text-sky-600 ring-sky-200",
};

interface BadgeProps {
  children: React.ReactNode;
  color?: ProjectColor;
  className?: string;
}

export function Badge({ children, color = "blue", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        COLOR_CLASSES[color],
        className
      )}
    >
      {children}
    </span>
  );
}
