import { Construction } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-3 px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
        <Construction className="h-8 w-8 text-blue-500" />
      </div>
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <p className="max-w-sm text-sm text-gray-400">
        Màn hình này chưa có trong ảnh thiết kế mẫu nên đang được để dạng khung sườn, sẵn sàng bổ sung khi có ảnh mẫu
        hoặc API tương ứng.
      </p>
    </div>
  );
}
