"use client";

import { AlertTriangle, FileClock } from "lucide-react";
import { cn } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

interface FormDraftBannerProps {
  savedAt: number;
  /** true nếu bản ghi đã được sửa trên server sau khi bản nháp này được lưu. */
  conflict: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

/**
 * Banner "có bản nháp chưa lưu" — hiện thời điểm lưu, cho phép Khôi phục/Bỏ.
 * Không tự áp draft: form vẫn hiển thị dữ liệu gốc (từ props/server) cho tới khi
 * người dùng bấm "Khôi phục" (đúng nguyên tắc GĐ7: không ghi đè dữ liệu edit mới).
 */
export function FormDraftBanner({ savedAt, conflict, onRestore, onDiscard, className }: FormDraftBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        conflict ? "border-amber-300 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-800",
        className
      )}
    >
      <span className="flex items-center gap-2">
        {conflict ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <FileClock className="h-4 w-4 shrink-0" />}
        <span>
          Có bản nháp lưu lúc <strong>{timeFormatter.format(savedAt)}</strong>.
          {conflict && " Bản ghi này đã được cập nhật trên hệ thống sau đó — kiểm tra kỹ trước khi khôi phục."}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-white/70"
        >
          Bỏ
        </button>
        <button
          type="button"
          onClick={onRestore}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-semibold text-white",
            conflict ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-600 hover:bg-brand-700"
          )}
        >
          Khôi phục
        </button>
      </span>
    </div>
  );
}

/** Checkbox "Ghi nhớ bản nháp trên thiết bị này" (bật localStorage thay vì sessionStorage). */
export function RememberDraftToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      Ghi nhớ bản nháp trên thiết bị này
    </label>
  );
}
