"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { ProjectMember } from "@/types/project";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface MemberMultiSelectProps {
  /** Danh sách được phép chọn; rỗng nghĩa là chưa chọn nguồn (dự án/công việc). */
  options: ProjectMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** Hiện khi `options` rỗng, giải thích cần chọn gì trước. */
  emptyHint?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function MemberMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Chọn người phụ trách...",
  emptyHint,
  disabled = false,
  invalid = false,
}: MemberMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const locked = disabled || options.length === 0;
  // Khoá thì luôn đóng, không cần effect đồng bộ lại state.
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
    () =>
      value
        .map((id) => options.find((option) => option.id === id))
        .filter((member): member is ProjectMember => Boolean(member)),
    [value, options]
  );

  const filtered = useMemo(() => {
    const keyword = normalize(search);
    if (!keyword) return options;
    return options.filter((option) =>
      normalize([option.name, option.role, option.email].filter(Boolean).join(" ")).includes(
        keyword
      )
    );
  }, [search, options]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-shadow",
          locked && "bg-gray-50",
          invalid
            ? "border-rose-400"
            : expanded
              ? "border-blue-400 ring-2 ring-blue-100"
              : "border-gray-200"
        )}
      >
        {selected.map((member, index) => (
          <span
            key={member.id}
            className="flex max-w-full items-center gap-1.5 rounded-md bg-blue-50 py-1 pl-1.5 pr-1 text-xs font-medium text-blue-700"
          >
            <Avatar name={member.name} color={member.avatarColor} size="sm" />
            <span className="truncate">{member.name}</span>
            {index === 0 && (
              <span className="rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-600">
                Chính
              </span>
            )}
            <button
              type="button"
              onClick={() => toggle(member.id)}
              disabled={disabled}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-blue-400 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50"
              aria-label={`Bỏ chọn ${member.name}`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={locked}
          className="flex min-h-7 min-w-[150px] flex-1 items-center justify-between gap-2 px-1.5 text-left text-sm text-gray-500 disabled:cursor-not-allowed"
          aria-expanded={expanded}
          aria-haspopup="listbox"
        >
          <span className="truncate">
            {options.length === 0
              ? (emptyHint ?? "Chưa có người để chọn")
              : selected.length === 0
                ? placeholder
                : "Thêm người phụ trách..."}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nhập tên, chức vụ hoặc email..."
              autoFocus
              className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div
            className="max-h-56 overflow-y-auto p-1.5"
            role="listbox"
            aria-multiselectable="true"
          >
            {filtered.map((option) => {
              const isSelected = value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                    isSelected && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  <Avatar name={option.name} color={option.avatarColor} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-700">
                      {option.name}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {[option.role, option.email].filter(Boolean).join(" · ") || "Nhân sự"}
                    </span>
                  </span>
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
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                Không tìm thấy nhân sự phù hợp
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
