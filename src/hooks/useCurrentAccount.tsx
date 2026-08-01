"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface CurrentAccount {
  id: string;
  name: string;
  username: string;
  email: string;
  role: "admin" | "manager" | "member";
  position?: string;
  avatarUrl?: string;
}

interface CurrentAccountState {
  account: CurrentAccount | null;
  loading: boolean;
}

/**
 * Nhiều component (Header, Sidebar, các trang danh sách...) cần tài khoản hiện
 * tại cùng lúc. Trước đây mỗi component tự gọi `useCurrentAccount` độc lập, tự
 * mount effect và tự query `tai_khoan` riêng — nhân bản round-trip mỗi khi vào
 * trang. Context này fetch đúng 1 lần và chia sẻ cho toàn bộ cây trang (xem
 * `agents/PERF-LOGIN-PAGELOAD-OPTIMIZATION-README.md`, giai đoạn 2).
 */
const CurrentAccountContext = createContext<CurrentAccountState | undefined>(undefined);

export function CurrentAccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CurrentAccountState>({ account: null, loading: true });

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const loadAccount = async (userId?: string) => {
      if (!userId) {
        if (active) setState({ account: null, loading: false });
        return;
      }
      const { data } = await supabase
        .from("tai_khoan")
        .select("id,ten_nv,username,email,role,chuc_vu,avatar_url")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (!active) return;
      setState({
        account: data
          ? {
              id: String(data.id),
              name: String(data.ten_nv),
              username: String(data.username ?? ""),
              email: String(data.email ?? ""),
              role: data.role as CurrentAccount["role"],
              position: data.chuc_vu ?? undefined,
              avatarUrl: data.avatar_url ?? undefined,
            }
          : null,
        loading: false,
      });
    };

    // Đọc phiên cục bộ (không gọi mạng) thay vì `getUser()` để có id tài khoản ngay khi mount.
    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => loadAccount(result.data.session?.user.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      void loadAccount(session?.user.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <CurrentAccountContext.Provider value={state}>{children}</CurrentAccountContext.Provider>
  );
}

/** Tài khoản `tai_khoan` tương ứng với phiên đăng nhập Supabase hiện tại. */
export function useCurrentAccount(): CurrentAccountState {
  const context = useContext(CurrentAccountContext);
  if (!context) {
    throw new Error("useCurrentAccount phải được gọi bên trong <CurrentAccountProvider>.");
  }
  return context;
}
