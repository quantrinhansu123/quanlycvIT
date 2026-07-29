"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { FeedbackProvider } from "@/components/ui/FeedbackProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <FeedbackProvider>
      <div className="flex h-screen bg-gray-50">
        <div className="hidden lg:block">
          <Sidebar collapsed={collapsed} />
        </div>
        <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            onToggleSidebar={() => setCollapsed((prev) => !prev)}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </FeedbackProvider>
  );
}
