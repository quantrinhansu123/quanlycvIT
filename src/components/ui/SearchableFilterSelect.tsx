"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableFilterOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableFilterSelectProps {
  options: SearchableFilterOption[];
  value: string;
  onChange: (value: string) => void;
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

/** Ô lọc chọn một, có ô tìm kiếm bên trong dropdown. */
export function SearchableFilterSelect({
  options,
  value,
  onChange,
  label,
  searchPlaceholder = "Tìm kiếm...",
  className,
}: SearchableFilterSelectProps) {
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

  const selectedLabel = options.find((option) => option.value === value)?.label;

  function select(nextValue: string) {
    onChange(nextValue === value ? "" : nextValue);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-lg border bg-white px-2.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100",
          value ? "border-brand-300 text-brand-600" : "border-gray-200 text-gray-600"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedLabel ?? label}</span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-brand-400 hover:bg-brand-100 hover:text-brand-700"
            aria-label="Bỏ lọc"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
          />
        )}
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
              className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5" role="listbox">
            {filtered.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-brand-50",
                    isSelected && "bg-brand-50 hover:bg-brand-50"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-700">{option.label}</span>
                    {option.sublabel && (
                      <span className="block truncate text-xs text-gray-400">{option.sublabel}</span>
                    )}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
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
