import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { loadKanbanInitialData } from "./loadKanbanInitialData";
import { KanbanClient } from "./KanbanClient";

export default async function KanbanPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialTasks } = await loadKanbanInitialData(supabase, access);

  return (
    <KanbanClient
      accountId={access.id}
      accountRole={access.role}
      initialTasks={initialTasks}
    />
  );
}
