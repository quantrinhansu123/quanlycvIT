"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SplitViewShell } from "@/components/layout/SplitViewShell";

interface ListDetailRouteShellProps {
  basePath: string;
  listSlot: ReactNode;
  children: ReactNode;
}

export function ListDetailRouteShell({
  basePath,
  listSlot,
  children,
}: ListDetailRouteShellProps) {
  const pathname = usePathname();
  const detailOpen = pathname.startsWith(`${basePath}/`);

  return (
    <SplitViewShell listSlot={listSlot} detailOpen={detailOpen}>
      {children}
    </SplitViewShell>
  );
}
