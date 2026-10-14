"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SplitViewShell } from "@/components/layout/SplitViewShell";

interface ListDetailRouteShellProps {
  basePath: string;
  listSlot: ReactNode;
  children: ReactNode;
  compactListWidthClassName?: string;
}

export function ListDetailRouteShell({
  basePath,
  listSlot,
  children,
  compactListWidthClassName,
}: ListDetailRouteShellProps) {
  const pathname = usePathname();
  const detailOpen = pathname.startsWith(`${basePath}/`);

  return (
    <SplitViewShell listSlot={listSlot} detailOpen={detailOpen} detailKey={pathname} compactListWidthClassName={compactListWidthClassName}>
      {children}
    </SplitViewShell>
  );
}
