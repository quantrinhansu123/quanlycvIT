"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchableFilterOption } from "@/components/ui/SearchableFilterSelect";

interface SearchableFilterMultiSelectProps {
  options: SearchableFilterOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Ô lọc chọn nhiều, có ô tìm kiếm và checkbox bên trong dropdown. */
export function SearchableFilterMultiSelect({
  options,
  value,
  onChange,
  label,
  searchPlaceholder = "Tìm kiếm...",
  className,
}: SearchableFilterMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filtered = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return options;
    return options.filter((option) =>
      normalize([option.label, option.sublabel].filter(Boolean).join(" ")).includes(keyword)
    );
  }, [search, options]);

  const selectedLabels = useMemo(
    () =>
      value
        .map((id) => options.find((option) => option.value === id)?.label)
        .filter((name): name is string => Boolean(name)),
    [value, options]
  );

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  const triggerLabel =
    selectedLabels.length === 0
      ? label
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} đã chọn`;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-lg border bg-white px-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
          value.length > 0 ? "border-blue-300 text-blue-600" : "border-gray-200 text-gray-600"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
              className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true">
            {filtered.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                    isSelected && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-700">{option.label}</span>
                    {option.sublabel && (
                      <span className="block truncate text-xs text-gray-400">{option.sublabel}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-transparent"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">Không tìm thấy kết quả phù hợp</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
