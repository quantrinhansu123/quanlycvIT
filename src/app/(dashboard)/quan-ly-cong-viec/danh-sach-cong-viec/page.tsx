import { createServerSupabaseClient } from "@/lib/supabase/api";
import { listDirectory, listProjectDirectory, listWorkTaskDirectory, listWorkTasksPage } from "@/lib/supabase/data";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { TaskListClient } from "./TaskListClient";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export default async function TaskListPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const isMember = access.role === "member";
  const participantAccountId = isMember ? access.id : undefined;

  const [initialTasks, initialProjects, initialMembers, initialDependencyTasks] = await Promise.all([
    listWorkTasksPage(supabase, {
      assigneeIds: isMember ? [access.id] : undefined,
      page: INITIAL_PAGE,
      pageSize: INITIAL_PAGE_SIZE,
    }),
    listProjectDirectory(supabase, participantAccountId),
    listDirectory(supabase),
    listWorkTaskDirectory(supabase, isMember ? [access.id] : undefined),
  ]);

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
