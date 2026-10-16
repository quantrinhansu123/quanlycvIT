import type { Metadata } from "next";
import localFont from "next/font/local";
import { WebVitalsReporter } from "@/components/observability/WebVitalsReporter";
import "./globals.css";

const roboto = localFont({
  src: [
    { path: "./fonts/Roboto-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Roboto-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Roboto-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/Roboto-MediumItalic.ttf", weight: "500", style: "italic" },
  ],
  variable: "--font-roboto",
  display: "swap",
});

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
    <html lang="vi" className={`${roboto.variable} h-full max-w-full overflow-x-clip`} suppressHydrationWarning>
      <body className="h-full max-w-full overflow-x-clip font-sans antialiased">
        {children}
        <WebVitalsReporter />
      </body>
    </html>
  );
}
