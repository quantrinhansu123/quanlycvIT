import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
      <p className="text-5xl font-bold text-blue-600">404</p>
      <p className="text-lg font-bold text-gray-900">Không tìm thấy trang</p>
      <p className="max-w-sm text-sm text-gray-500">Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.</p>
      <Link href="/" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Về Dashboard
      </Link>
    </div>
  );
}
