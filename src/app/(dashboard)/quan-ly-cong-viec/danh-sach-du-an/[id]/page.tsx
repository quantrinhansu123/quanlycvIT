import { createServerSupabaseClient } from "@/lib/supabase/api";
import { getProject, listDirectory, listProjectTasks } from "@/lib/supabase/data";
import { assertProjectReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { ProjectDetailView } from "./ProjectDetailView";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  await assertProjectReadable(supabase, access, id);
  const readOnly = access.role === "member";

  const [project, tasks, members] = await Promise.all([
    getProject(supabase, id),
    listProjectTasks(supabase, id, readOnly ? [access.id] : undefined),
    readOnly ? Promise.resolve([]) : listDirectory(supabase),
  ]);

  return (
    <ProjectDetailView
      projectId={id}
      initialProject={project}
      initialTasks={tasks}
      initialMembers={members}
      readOnly={readOnly}
    />
  );
}
