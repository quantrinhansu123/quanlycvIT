import { createServerSupabaseClient } from "@/lib/supabase/api";
import { assertWorkTaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import {
  getProject,
  getWorkTask,
  listSubtasks,
} from "@/lib/supabase/data";
import { TaskDetailView } from "./TaskDetailView";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  await assertWorkTaskReadable(supabase, access, id);
  const memberAssigneeIds = access.role === "member" ? [access.id] : undefined;

  const task = await getWorkTask(supabase, id);
  const [project, dependency, subtasks] = await Promise.all([
    task ? getProject(supabase, task.projectId) : Promise.resolve(null),
    task?.dependsOnTaskId ? getWorkTask(supabase, task.dependsOnTaskId) : Promise.resolve(null),
    listSubtasks(supabase, { workTaskId: id, assigneeIds: memberAssigneeIds }),
  ]);
  const members = [
    ...(project?.managers ?? []),
    ...(project?.members ?? []),
    ...(task?.assignees ?? []),
  ].filter((member, index, list) => list.findIndex((item) => item.id === member.id) === index);

  return (
    <TaskDetailView
      taskId={id}
      initialTask={task}
      initialProjects={project ? [project] : []}
      initialReports={[]}
      initialAllTasks={dependency ? [dependency] : []}
      initialSubtasks={subtasks}
      initialMembers={members}
      readOnly={access.role === "member"}
    />
  );
}
