import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { TaskListClient } from "./TaskListClient";
import { loadTaskListInitialData } from "./loadTaskListInitialData";

export default async function TaskListPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  const { initialTasks, initialProjects, initialMembers, initialDependencyTasks } =
    await loadTaskListInitialData(supabase, access);

  return (
    <TaskListClient
      accountId={access.id}
      accountRole={access.role}
      initialTasks={initialTasks}
      initialProjects={initialProjects}
      initialMembers={initialMembers}
      initialDependencyTasks={initialDependencyTasks}
    />
  );
}
