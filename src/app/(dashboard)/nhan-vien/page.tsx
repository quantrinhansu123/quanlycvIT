import { redirect } from "next/navigation";
import { AccountManagementPage } from "@/components/accounts/AccountManagementPage";
import { getServerAccountProfile } from "@/lib/supabase/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/api";
import { listAccountsPage } from "@/lib/supabase/accounts";
import type { AccountPage } from "@/types/account";

export default async function EmployeesPage() {
  const profile = await getServerAccountProfile();
  if (!profile) redirect("/dang-nhap");
  if (profile.role === "member") redirect("/");

  let initialData: AccountPage | undefined;
  try {
    const supabase = await createServerSupabaseClient();
    initialData = await listAccountsPage(
      supabase,
      { page: 1, pageSize: 50, sort: "createdAt", direction: "desc" },
      profile.id
    );
  } catch {
    // Keep the client fetch fallback if server-side data loading is unavailable.
  }

  return <AccountManagementPage initialData={initialData} />;
}
