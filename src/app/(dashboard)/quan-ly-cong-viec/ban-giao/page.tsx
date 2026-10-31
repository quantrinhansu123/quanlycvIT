import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { loadHandoverInitialData } from "./loadHandoverInitialData";
import { HandoverClient } from "./HandoverClient";

export default async function HandoverPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialSubtasks } = await loadHandoverInitialData(supabase, access);

  return (
    <HandoverClient
      accountId={access.id}
      accountRole={access.role}
      initialSubtasks={initialSubtasks}
    />
  );
}
