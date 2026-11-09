"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchableOption } from "@/components/ui/SearchableSelect";

interface SearchableMultiSelectProps {
  options: SearchableOption[];
  values: string[];
  onChange: (values: string[]) => void;
  /** Nhãn hiển thị khi chưa chọn gì. */
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
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

/** Ô chọn nhiều, có ô tìm kiếm bên trong dropdown. */
export function SearchableMultiSelect({
  options,
  values,
  onChange,
  placeholder = "Tất cả",
  searchPlaceholder = "Tìm kiếm...",
  disabled,
  className,
}: SearchableMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Chỉ một dropdown được mở tại một thời điểm.
  useEffect(() => {
    function handleOtherOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== instanceId) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("searchable-select-open", handleOtherOpen);
    return () => document.removeEventListener("searchable-select-open", handleOtherOpen);
  }, [instanceId]);

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
  }, [options, search]);

  const selectedOptions = options.filter((option) => values.includes(option.value));

  function toggle(nextValue: string) {
    onChange(
      values.includes(nextValue)
        ? values.filter((item) => item !== nextValue)
        : [...values, nextValue]
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            document.dispatchEvent(new CustomEvent("searchable-select-open", { detail: instanceId }));
          }
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          !selectedOptions.length && "text-slate-400"
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedOptions.length
            ? selectedOptions.length === 1
              ? selectedOptions[0].label
              : `${selectedOptions.length} mục đã chọn`
            : placeholder}
        </span>
        {selectedOptions.length ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Bỏ chọn tất cả"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                }
              }}
              placeholder={searchPlaceholder}
              autoFocus
              className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            <span>{values.length ? `${values.length} mục đã chọn` : "Chưa chọn mục nào"}</span>
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-indigo-600 hover:underline"
              >
                Bỏ chọn
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true">
            {filtered.map((option) => {
              const isSelected = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-indigo-50",
                    isSelected && "bg-indigo-50 hover:bg-indigo-50"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{option.label}</span>
                    {option.sublabel && (
                      <span className="block truncate text-xs text-slate-400">{option.sublabel}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Không tìm thấy kết quả phù hợp</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
