import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { ListDetailRouteShell } from "@/components/layout/ListDetailRouteShell";
import { TaskListClient } from "./TaskListClient";
import { loadTaskListInitialData } from "./loadTaskListInitialData";

export default async function TaskListLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialTasks, initialProjects, initialMembers, initialDependencyTasks } =
    await loadTaskListInitialData(supabase, access);

  return (
    <ListDetailRouteShell
      basePath="/quan-ly-cong-viec/danh-sach-cong-viec"
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
    </ListDetailRouteShell>
  );
}
