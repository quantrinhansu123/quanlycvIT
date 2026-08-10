import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { listDirectory, listProjectDirectory, listSubtasksPage, listWorkTaskDirectory } from "@/lib/supabase/data";
import type { RequestAccountAccess } from "@/lib/supabase/authorization";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export async function loadSubtaskListInitialData(supabase: ApiSupabaseClient, access: RequestAccountAccess) {
  const isMember = access.role === "member";
  const participantAccountId = isMember ? access.id : undefined;

  const [initialSubtasks, initialWorkTasks, initialMembers, initialProjects] = await Promise.all([
    listSubtasksPage(supabase, {
      assigneeIds: isMember ? [access.id] : undefined,
      page: INITIAL_PAGE,
      pageSize: INITIAL_PAGE_SIZE,
    }),
    listWorkTaskDirectory(supabase, isMember ? [access.id] : undefined),
    listDirectory(supabase),
    listProjectDirectory(supabase, participantAccountId),
  ]);

  return { initialSubtasks, initialWorkTasks, initialMembers, initialProjects };
}
