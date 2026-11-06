import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { loadKanbanInitialData } from "./loadKanbanInitialData";
import { KanbanDetailClient } from "./KanbanDetailClient";

export default async function KanbanPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialItems } = await loadKanbanInitialData(supabase, access);

  return (
    <KanbanDetailClient
      accountId={access.id}
      accountRole={access.role}
      initialItems={initialItems}
    />
  );
}
