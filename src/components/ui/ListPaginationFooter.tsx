"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";

interface ListPaginationFooterProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizes?: number[];
}

export function ListPaginationFooter({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizes = [20, 50, 100],
}: ListPaginationFooterProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);

  return (
    <footer
      data-list-footer
      className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2.5 text-xs"
    >
      <div className="flex items-center gap-3 text-gray-600">
        <span>
          Tổng: <b>{total}</b> bản ghi
        </span>
        <span>Hiển thị</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 rounded-lg border border-gray-200 px-2 outline-none"
          aria-label="Số bản ghi mỗi trang"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span>/ trang</span>
      </div>

      <div className="flex items-center gap-1">
        <FooterButton
          label="Trang đầu"
          icon={ChevronsLeft}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
        />
        <FooterButton
          label="Trang trước"
          icon={ChevronLeft}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        />
        <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-600 px-3 font-semibold text-white">
          {currentPage}
        </span>
        <span className="px-1 text-gray-600">/ {pageCount}</span>
        <FooterButton
          label="Trang sau"
          icon={ChevronRight}
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        />
        <FooterButton
          label="Trang cuối"
          icon={ChevronsRight}
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(pageCount)}
        />
      </div>
    </footer>
  );
}

function FooterButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
