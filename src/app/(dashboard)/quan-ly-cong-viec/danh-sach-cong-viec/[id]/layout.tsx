import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { SplitViewShell } from "@/components/layout/SplitViewShell";
import { TaskListClient } from "../TaskListClient";
import { loadTaskListInitialData } from "../loadTaskListInitialData";

export default async function TaskDetailLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  const { initialTasks, initialProjects, initialMembers, initialDependencyTasks } =
    await loadTaskListInitialData(supabase, access);

  return (
    <SplitViewShell
      listSlot={
        <TaskListClient
          accountId={access.id}
          accountRole={access.role}
          initialTasks={initialTasks}
          initialProjects={initialProjects}
          initialMembers={initialMembers}
          initialDependencyTasks={initialDependencyTasks}
        />
      }
    >
      {children}
    </SplitViewShell>
  );
}
