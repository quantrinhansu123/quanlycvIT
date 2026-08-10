import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listDirectory, listProjectDirectory, listWorkTaskDirectory, listWorkTasksPage } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export async function loadTaskListInitialData(supabase: ApiSupabaseClient, access: RequestAccountAccess) {
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

  return { initialTasks, initialProjects, initialMembers, initialDependencyTasks };
}
