"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
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

  // Supabase có thể phát lại SIGNED_IN cho cùng tài khoản khi tab được kích hoạt
  // trở lại (xác nhận/refresh phiên hiện tại), không chỉ khi thực sự đăng nhập
  // mới. Phải theo dõi user ID để phân biệt "cùng tài khoản" với "đổi tài khoản",
  // nếu không cache bị xóa oan mỗi lần quay lại tab -> danh sách kẹt skeleton.
  const currentUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const userId = session?.user?.id ?? null;

      if (event === "INITIAL_SESSION") {
        currentUserIdRef.current = userId;
        return;
      }

      if (event === "SIGNED_OUT") {
        currentUserIdRef.current = null;
        cache.clear();
        clearAllFormDrafts();
        return;
      }

      if (event === "SIGNED_IN") {
        const isSameAccount = currentUserIdRef.current !== undefined && currentUserIdRef.current === userId;
        currentUserIdRef.current = userId;
        if (isSameAccount) return;
        // Đổi tài khoản trên cùng tab: xóa sạch cache + bản nháp form để không
        // rò dữ liệu/quyền của tài khoản trước sang tài khoản sau.
        cache.clear();
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
