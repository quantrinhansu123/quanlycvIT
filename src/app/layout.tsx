import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Goal App - Quản lý công việc",
    template: "%s | Goal App",
  },
  description:
    "Goal App - Nền tảng quản trị dự án, công việc và tiến độ đội nhóm.",
  openGraph: {
    title: "Goal App - Quản lý công việc",
    description:
      "Goal App - Nền tảng quản trị dự án, công việc và tiến độ đội nhóm.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full`}>
      <body className="h-full font-sans antialiased">{children}</body>
    </html>
  );
}
