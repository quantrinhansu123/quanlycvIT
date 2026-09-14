"use client";

import { useCallback } from "react";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import type { CacheTtl } from "@/lib/client-cache/session-data-cache";

/**
 * Trả về hàm nạp trước dữ liệu vào SessionDataCache theo key — dùng trong
 * IntentPrefetchLink hoặc bất kỳ nơi nào cần "đoán trước" ý định điều hướng.
 * Tự dedupe/giới hạn đồng thời qua SessionDataCache.prefetch, gọi vô tư không sợ bão request.
 */
export function usePrefetchSessionQuery() {
  const cache = useSessionDataCache();

  return useCallback(
    <T,>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, ttl: CacheTtl) => {
      cache.prefetch(key, fetcher, ttl);
    },
    [cache]
  );
}
