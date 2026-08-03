"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SessionDataCache } from "@/lib/client-cache/session-data-cache";
import { clearAllFormDrafts } from "@/hooks/useVersionedFormDraft";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";

const SessionDataCacheContext = createContext<SessionDataCache | null>(null);

export function SessionDataCacheProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new SessionDataCache({
    invalidationDependencies: {
      [CACHE_RESOURCE.projectsList]: [CACHE_RESOURCE.dashboard],
      [CACHE_RESOURCE.tasksList]: [CACHE_RESOURCE.dashboard],
      [CACHE_RESOURCE.subtasksList]: [CACHE_RESOURCE.dashboard],
      [CACHE_RESOURCE.directoryMembers]: [CACHE_RESOURCE.dashboard],
    },
  }));

  useEffect(() => {
    const supabase = createClient();
    // SIGNED_OUT: đăng xuất. SIGNED_IN: có thể là đổi tài khoản trên cùng tab
    // (đăng nhập lại sau khi hết phiên). Cả hai đều phải xóa sạch cache phiên
    // để không rò dữ liệu/quyền của tài khoản trước sang tài khoản sau.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        cache.clear();
        // Bản nháp form (GĐ7) khóa theo accountId nên tài khoản sau không đọc được
        // draft của tài khoản trước, nhưng vẫn dọn hẳn để không tồn đọng trên máy dùng chung.
        clearAllFormDrafts();
      }
    });
    return () => subscription.unsubscribe();
  }, [cache]);

  return (
    <SessionDataCacheContext.Provider value={cache}>
      {children}
    </SessionDataCacheContext.Provider>
  );
}

/** Cache phiên dùng chung cho toàn bộ dashboard — xem session-data-cache.ts để biết nguyên tắc. */
export function useSessionDataCache(): SessionDataCache {
  const cache = useContext(SessionDataCacheContext);
  if (!cache) {
    throw new Error("useSessionDataCache phải được gọi bên trong <SessionDataCacheProvider>.");
  }
  return cache;
}
