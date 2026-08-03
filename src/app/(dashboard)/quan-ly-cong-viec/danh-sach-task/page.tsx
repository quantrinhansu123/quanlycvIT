import { createServerSupabaseClient } from "@/lib/supabase/api";
import { listDirectory, listProjectDirectory, listSubtasksPage, listWorkTaskDirectory } from "@/lib/supabase/data";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { SubtaskListClient } from "./SubtaskListClient";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export default async function SubtaskListPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
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
