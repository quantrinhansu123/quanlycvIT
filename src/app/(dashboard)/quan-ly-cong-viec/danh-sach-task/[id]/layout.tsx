import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { SplitViewShell } from "@/components/layout/SplitViewShell";
import { SubtaskListClient } from "../SubtaskListClient";
import { loadSubtaskListInitialData } from "../loadSubtaskListInitialData";

export default async function SubtaskDetailLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  const { initialSubtasks, initialWorkTasks, initialMembers, initialProjects } =
    await loadSubtaskListInitialData(supabase, access);

  return (
    <SplitViewShell
      listSlot={
        <SubtaskListClient
          accountId={access.id}
          accountRole={access.role}
          initialSubtasks={initialSubtasks}
          initialWorkTasks={initialWorkTasks}
          initialMembers={initialMembers}
          initialProjects={initialProjects}
        />
      }
    >
      {children}
    </SplitViewShell>
  );
}
