import { TableSkeleton } from "@/components/ui/Skeleton";

/**
 * Suspense boundary riêng cho toàn bộ nhóm route `(dashboard)`. Nếu không có
 * file này, khi một trang con (ví dụ trang chi tiết dự án — Server Component
 * có `await`) đang tải, `loading.tsx` ở gốc `src/app/` sẽ là boundary gần nhất
 * và thay toàn bộ layout (kể cả Header/Sidebar) bằng màn spinner trắng, rồi
 * bật lại toàn bộ khi xong — cảm giác "giật/trắng trang" khi điều hướng. Đặt
 * boundary ở đây giữ Header/Sidebar (nằm trong `(dashboard)/layout.tsx`) đứng
 * yên, chỉ vùng nội dung hiển thị skeleton (xem
 * `agents/PERF-LOGIN-PAGELOAD-OPTIMIZATION-README.md`, giai đoạn 3).
 */
export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
        <div className="h-9 w-9 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
