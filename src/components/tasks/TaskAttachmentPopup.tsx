"use client";

import { useId, useRef, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function TaskAttachmentPopup({ count, readOnly, children }: {
  count: number;
  readOnly: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-xs text-gray-500">Tài liệu ({count})</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.showModal()}>
          {!readOnly && <Plus className="h-3.5 w-3.5" />}
          {readOnly ? "Xem tài liệu" : "Thêm mới"}
        </Button>
      </div>
      <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[85dvh] w-[min(720px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-800 shadow-xl backdrop:bg-black/40">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">{readOnly ? "Tệp đính kèm" : "Thêm tệp đính kèm"}</h2>
          <button type="button" autoFocus aria-label="Đóng" onClick={() => dialog.current?.close()} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-5">
          {!readOnly && <p className="pt-4 text-xs text-gray-500">Chọn ảnh, tệp hoặc thêm liên kết và nhập thông tin mô tả. Thay đổi được tự động lưu.</p>}
          {children}
        </div>
        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.close()}>Đóng</Button>
        </div>
      </dialog>
    </>
  );
}
