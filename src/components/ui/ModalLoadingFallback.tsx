/** Hiển thị trong lúc code của modal/drawer (được tải lười qua next/dynamic) đang tải về. */
export function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}
