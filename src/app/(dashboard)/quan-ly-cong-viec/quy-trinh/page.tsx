import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { listProjectDirectory } from "@/lib/supabase/data";
import { listProjectProcesses } from "@/lib/supabase/project-processes";
import { ProjectProcessesClient } from "./ProjectProcessesClient";

export default async function ProjectProcessesPage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const projects = await listProjectDirectory(supabase, access.role === "member" ? access.id : undefined);
  const { processes, migrationReady, coverReady } = await listProjectProcesses(supabase, projects.map((project) => project.id));
  return <ProjectProcessesClient initialProjects={projects} initialProcesses={processes}
    migrationReady={migrationReady} coverReady={coverReady} canEdit={access.role !== "member"} />;
}
