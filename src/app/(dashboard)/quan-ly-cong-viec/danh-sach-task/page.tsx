import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { SubtaskListClient } from "./SubtaskListClient";
import { loadSubtaskListInitialData } from "./loadSubtaskListInitialData";

export default async function SubtaskListPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  const { initialSubtasks, initialWorkTasks, initialMembers, initialProjects } =
    await loadSubtaskListInitialData(supabase, access);

  return (
    <SubtaskListClient
      accountId={access.id}
      accountRole={access.role}
      initialSubtasks={initialSubtasks}
      initialWorkTasks={initialWorkTasks}
      initialMembers={initialMembers}
      initialProjects={initialProjects}
    />
  );
}
