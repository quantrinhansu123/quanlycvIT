"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { FeedbackProvider } from "@/components/ui/FeedbackProvider";
import {
  CurrentAccountProvider,
  type CurrentAccount,
} from "@/hooks/useCurrentAccount";
import { SessionDataCacheProvider } from "@/components/providers/SessionDataCacheProvider";

export function DashboardShell({
  children,
  initialAccount,
}: {
  children: React.ReactNode;
  initialAccount: CurrentAccount | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <CurrentAccountProvider initialAccount={initialAccount}>
      <SessionDataCacheProvider>
        <FeedbackProvider>
          <div className="flex h-dvh w-full max-w-full overflow-hidden overscroll-none bg-gray-50 [contain:inline-size]">
            <Sidebar collapsed={collapsed} variant="rail" />
            <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden [contain:inline-size]">
              <Header
                onToggleSidebar={() => setCollapsed((prev) => !prev)}
                onOpenMobileMenu={() => setMobileMenuOpen(true)}
              />
              <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-clip overflow-y-auto [contain:inline-size]">
                {children}
              </main>
            </div>
          </div>
        </FeedbackProvider>
      </SessionDataCacheProvider>
    </CurrentAccountProvider>
  );
}
