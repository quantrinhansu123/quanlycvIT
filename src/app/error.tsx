"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
      <p className="text-lg font-bold text-gray-900">Đã có lỗi xảy ra</p>
      <p className="max-w-sm text-sm text-gray-500">Vui lòng thử tải lại trang. Nếu lỗi vẫn tiếp diễn, hãy liên hệ quản trị viên.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Thử lại
      </button>
    </div>
  );
}
