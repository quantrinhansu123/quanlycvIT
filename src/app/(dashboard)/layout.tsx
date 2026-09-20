import { createServerSupabaseClient } from "@/lib/supabase/api";
import { getServerAccountProfile } from "@/lib/supabase/authorization";
import { DashboardShell } from "./DashboardShell";
import type { CurrentAccount } from "@/hooks/useCurrentAccount";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerAccountProfile();
  const initialAccount: CurrentAccount | null = profile
    ? {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        position: profile.position,
        avatarUrl: profile.avatarUrl,
      }
    : null;

  return <DashboardShell initialAccount={initialAccount}>{children}</DashboardShell>;
}
