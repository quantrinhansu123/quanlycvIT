import { createServerSupabaseClient } from "@/lib/supabase/api";
import {
  getWorkTask,
  listDirectory,
  listProjects,
  listSubtasks,
  listTaskReports,
  listWorkTasks,
} from "@/lib/supabase/data";
import { TaskDetailView } from "./TaskDetailView";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [task, projects, reports, allTasks, subtasks, members] = await Promise.all([
    getWorkTask(supabase, id),
    listProjects(supabase),
    listTaskReports(supabase, id),
    listWorkTasks(supabase),
    listSubtasks(supabase, { workTaskId: id }),
    listDirectory(supabase),
  ]);

  return (
    <TaskDetailView
      taskId={id}
      initialTask={task}
      initialProjects={projects}
      initialReports={reports}
      initialAllTasks={allTasks}
      initialSubtasks={subtasks}
      initialMembers={members}
    />
  );
}
