"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import type { CacheTtl } from "@/lib/client-cache/session-data-cache";

export type SessionQueryStatus = "loading" | "success" | "error";

export interface UseSessionQueryOptions<T> {
  /** `null`/`undefined` tắt hẳn hook (không tải dữ liệu) — dùng khi chưa đủ điều kiện (vd. chưa biết accountId). */
  key: string | null | undefined;
  fetcher: (signal: AbortSignal) => Promise<T>;
  ttl: CacheTtl;
  /**
   * Dữ liệu đã tải sẵn từ Server Component (Giai đoạn 5) — seed thẳng vào cache
   * ngay lần mount đầu tiên của đúng `key` này, không gọi fetcher, không hiện
   * loading. Chỉ có tác dụng một lần cho lần mount đầu; đổi key sau đó (filter,
   * trang) đi qua đường fetch bình thường như không có initialData.
   */
  initialData?: T;
}

export interface UseSessionQueryResult<T> {
  data: T | undefined;
  status: SessionQueryStatus;
  /** true nếu đang có dữ liệu cũ nhưng đang revalidate nền (không phải lần tải đầu). */
  isRevalidating: boolean;
  error: unknown;
  /** Bỏ cache hiện tại và tải lại. */
  refresh: () => void;
  /** Ghi đè dữ liệu trong cache (cập nhật optimistic sau mutation). */
  setData: (updater: T | ((previous: T | undefined) => T)) => void;
}

/**
 * Đọc dữ liệu qua SessionDataCache theo quy tắc stale-while-revalidate của
 * PERF-UNIFIED-IMPLEMENTATION-PLAN.md mục 5 (Giai đoạn 4):
 * cache miss → loading; fresh → dùng thẳng; stale nhưng dùng được → hiện ngay +
 * revalidate nền; revalidate lỗi → giữ dữ liệu cũ, báo lỗi qua `error`.
 */
export function useSessionQuery<T>({
  key,
  fetcher,
  ttl,
  initialData,
}: UseSessionQueryOptions<T>): UseSessionQueryResult<T> {
  const cache = useSessionDataCache();
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Chạy đúng một lần khi component này mount lần đầu (kể cả trong SSR pass của
  // Client Component) — đây là cơ chế được React "cho phép" để làm việc một lần
  // trước render đầu tiên, khác với việc ghi ref/state trực tiếp trong thân render.
  useState(() => {
    if (key && initialData !== undefined && !cache.get<T>(key)) {
      cache.set(key, initialData, ttl);
    }
    return null;
  });
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);
  const [error, setError] = useState<unknown>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [revalidateTick, setRevalidateTick] = useState(0);

  const entry = key ? cache.get<T>(key) : undefined;
  const data = entry?.data;

  useEffect(() => {
    if (!key) return;
    return cache.subscribe(key, forceRender);
  }, [cache, key]);

  useEffect(() => {
    if (!key) return;
    const hadEntry = Boolean(cache.get<T>(key));
    const needsFetch = !hadEntry || cache.isStale(key);
    if (!needsFetch) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRevalidating(true);
    setError(null);
    cache
      .fetch(key, (signal) => fetcherRef.current(signal), ttl)
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Giữ dữ liệu cũ trong cache nguyên vẹn — chỉ báo lỗi để UI hiện cảnh báo nhỏ + nút thử lại.
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsRevalidating(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, key, ttl.freshMs, ttl.staleMs, revalidateTick]);

  const refresh = useCallback(() => {
    if (!key) return;
    cache.invalidate(key);
    setRevalidateTick((tick) => tick + 1);
  }, [cache, key]);

  const setData = useCallback(
    (updater: T | ((previous: T | undefined) => T)) => {
      if (!key) return;
      const previous = cache.get<T>(key)?.data;
      const next = typeof updater === "function" ? (updater as (p: T | undefined) => T)(previous) : updater;
      cache.set(key, next, ttl);
    },
    [cache, key, ttl]
  );

  const status: SessionQueryStatus = data !== undefined ? "success" : error ? "error" : "loading";

  return { data, status, isRevalidating: isRevalidating && data !== undefined, error, refresh, setData };
}
