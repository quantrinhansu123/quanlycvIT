"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  compact?: boolean;
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
  compact = false,
}: FilterSelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full appearance-none truncate rounded-lg border bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
          compact ? "h-9 py-1.5 pl-2.5 pr-7 text-xs" : "h-10 py-2 pl-3 pr-8 text-sm",
          value ? "border-blue-300 text-blue-600" : "border-gray-200 text-gray-600"
        )}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400",
          compact ? "right-2 h-3.5 w-3.5" : "right-2.5 h-4 w-4"
        )}
      />
    </div>
  );
}
