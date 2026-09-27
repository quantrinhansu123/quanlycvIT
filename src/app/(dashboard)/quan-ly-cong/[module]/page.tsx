import { notFound, redirect } from "next/navigation";
import { ComingSoon } from "@/components/ui/ComingSoon";

const MODULE_NAMES: Record<string, string> = {
  "cham-cong": "Chấm Công",
  "thong-ke-cong": "Thống Kê Công",
  "duyet-cong": "Duyệt Công",
  "nghi-phep": "Nghỉ Phép",
  "ban-do-nhan-vien": "Bản Đồ Nhân Viên",
  "cau-hinh-ngay-le": "Cấu Hình Ngày Lễ",
};

export function generateStaticParams() {
  return Object.keys(MODULE_NAMES).map((module) => ({ module }));
}

export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "cham-cong") redirect("/nhan-vien/cham-cong");
  const title = MODULE_NAMES[module];
  if (!title) notFound();
  return <ComingSoon title={title} />;
}
