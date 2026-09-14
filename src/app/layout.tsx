import type { Metadata } from "next";
import { WebVitalsReporter } from "@/components/observability/WebVitalsReporter";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IT Việt Nhật - Quản lý công việc",
    template: "%s | IT Việt Nhật",
  },
  description:
    "IT Việt Nhật - Nền tảng quản trị dự án, công việc và tiến độ đội nhóm.",
  openGraph: {
    title: "IT Việt Nhật - Quản lý công việc",
    description:
      "IT Việt Nhật - Nền tảng quản trị dự án, công việc và tiến độ đội nhóm.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full max-w-full overflow-x-clip" suppressHydrationWarning>
      <body className="h-full max-w-full overflow-x-clip font-sans antialiased">
        {children}
        <WebVitalsReporter />
      </body>
    </html>
  );
}
