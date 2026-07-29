import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, className, barClassName, showLabel = true }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-1.5 w-24 overflow-hidden rounded-full bg-gray-100", className)}>
        <div
          className={cn("h-full rounded-full bg-violet-500", barClassName)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-medium text-gray-500">{clamped}%</span>}
    </div>
  );
}
