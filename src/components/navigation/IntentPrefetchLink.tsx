"use client";

import { useRef } from "react";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface IntentPrefetchLinkProps
  extends LinkProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onPointerEnter" | "onFocus" | "onTouchStart"> {
  children: ReactNode;
  /** Nạp trước dữ liệu client (qua usePrefetchSessionQuery) khi có ý định điều hướng — tùy chọn. */
  onIntent?: () => void;
}

/**
 * `next/link` có thêm prefetch route (RSC payload) và dữ liệu client ngay khi
 * người dùng có ý định điều hướng (hover/focus/chạm), thay vì chờ tới lúc bấm.
 * Không prefetch hàng loạt khi mount — chỉ kích hoạt theo tương tác thật, và
 * chỉ một lần cho mỗi lần mount (tránh gọi lại prefetch mỗi lần con trỏ di chuyển).
 */
export function IntentPrefetchLink({ href, onIntent, children, ...rest }: IntentPrefetchLinkProps) {
  const router = useRouter();
  const firedRef = useRef(false);

  function handleIntent() {
    if (firedRef.current) return;
    firedRef.current = true;
    router.prefetch(typeof href === "string" ? href : (href.pathname ?? String(href)));
    onIntent?.();
  }

  return (
    <Link href={href} onPointerEnter={handleIntent} onFocus={handleIntent} onTouchStart={handleIntent} {...rest}>
      {children}
    </Link>
  );
}
