"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
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

/** Tài khoản `tai_khoan` tương ứng với phiên đăng nhập Supabase hiện tại. */
export function useCurrentAccount(): { account: CurrentAccount | null; loading: boolean } {
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const loadAccount = async (userId?: string) => {
      if (!userId) {
        if (active) {
          setAccount(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("tai_khoan")
        .select("id,ten_nv,username,email,role,chuc_vu,avatar_url")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (!active) return;
      setAccount(
        data
          ? {
              id: String(data.id),
              name: String(data.ten_nv),
              username: String(data.username ?? ""),
              email: String(data.email ?? ""),
              role: data.role as CurrentAccount["role"],
              position: data.chuc_vu ?? undefined,
              avatarUrl: data.avatar_url ?? undefined,
            }
          : null
      );
      setLoading(false);
    };

    void supabase.auth
      .getUser()
      .then((result: { data: { user: User | null } }) => loadAccount(result.data.user?.id));
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

  return { account, loading };
}
