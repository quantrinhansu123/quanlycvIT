"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SingleSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Class Tailwind cho chấm màu hiển thị trước nhãn (VD: trạng thái, mức độ ưu tiên). */
  dotClassName?: string;
}

interface SingleSelectDropdownProps {
  options: SingleSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Hiện khi `options` rỗng, giải thích cần chọn gì trước. */
  emptyHint?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Có ô tìm kiếm bên trong dropdown hay không. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Hiển thị ô dấu tích ở cuối lựa chọn đang được chọn. */
  showSelectionIndicator?: boolean;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Ô chọn một giá trị, cùng kiểu dáng với MemberMultiSelect (dùng cho dự án, trạng thái, mức độ ưu tiên...). */
export function SingleSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "Chọn...",
  emptyHint,
  disabled = false,
  invalid = false,
  searchable = false,
  searchPlaceholder = "Tìm kiếm...",
  showSelectionIndicator = true,
}: SingleSelectDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const locked = disabled || options.length === 0;
  const expanded = open && !locked;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const keyword = normalize(search);
    if (!keyword) return options;
    return options.filter((option) =>
      normalize([option.label, option.sublabel].filter(Boolean).join(" ")).includes(keyword)
    );
  }, [search, options, searchable]);

  function select(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={locked}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm transition-shadow disabled:cursor-not-allowed disabled:bg-gray-50",
          invalid
            ? "border-rose-400"
            : expanded
              ? "border-blue-400 ring-2 ring-blue-100"
              : "border-gray-200"
        )}
        aria-expanded={expanded}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {selected?.dotClassName && (
            <span className={cn("h-2 w-2 shrink-0 rounded-full", selected.dotClassName)} />
          )}
          <span className={cn("truncate", !selected && "text-gray-500")}>
            {options.length === 0
              ? (emptyHint ?? "Chưa có lựa chọn")
              : (selected?.label ?? placeholder)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-400 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {searchable && (
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
          )}
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
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                    isSelected && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  {option.dotClassName && (
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", option.dotClassName)} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-700">
                      {option.label}
                    </span>
                    {option.sublabel && (
                      <span className="block truncate text-xs text-gray-400">{option.sublabel}</span>
                    )}
                  </span>
                  {showSelectionIndicator && (
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300 text-transparent"
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                Không tìm thấy kết quả phù hợp
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
