import type { Metadata } from "next";
import { LoginPage } from "@/components/auth/LoginPage";

export const metadata: Metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập vào hệ thống quản trị Goal App.",
};

export default function SignInPage() {
  return <LoginPage />;
}
