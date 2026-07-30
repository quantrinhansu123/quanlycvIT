import { createServerSupabaseClient } from "@/lib/supabase/api";
import { getProject, listDirectory, listProjectTasks } from "@/lib/supabase/data";
import { ProjectDetailView } from "./ProjectDetailView";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [project, tasks, members] = await Promise.all([
    getProject(supabase, id),
    listProjectTasks(supabase, id),
    listDirectory(supabase),
  ]);

  return (
    <ProjectDetailView
      projectId={id}
      initialProject={project}
      initialTasks={tasks}
      initialMembers={members}
    />
  );
}
