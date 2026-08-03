import { createServerSupabaseClient } from "@/lib/supabase/api";
import { listDirectory, listProjectsPage } from "@/lib/supabase/data";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { ProjectListClient } from "./ProjectListClient";

const INITIAL_PAGE = 1;
const INITIAL_PAGE_SIZE = 50;

export default async function ProjectListPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const readOnly = access.role === "member";
  const participantAccountId = readOnly ? access.id : undefined;

  const [initialProjects, initialMembers] = await Promise.all([
    listProjectsPage(supabase, {
      participantAccountId,
      page: INITIAL_PAGE,
      pageSize: INITIAL_PAGE_SIZE,
    }),
    readOnly ? Promise.resolve([]) : listDirectory(supabase),
  ]);

  return (
    <ProjectListClient
      accountId={access.id}
      accountRole={access.role}
      initialProjects={initialProjects}
      initialMembers={initialMembers}
    />
  );
}
