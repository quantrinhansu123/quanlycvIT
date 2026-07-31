import { createServerSupabaseClient } from "@/lib/supabase/api";
import { assertWorkTaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
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
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  await assertWorkTaskReadable(supabase, access, id);
  const memberAssigneeIds = access.role === "member" ? [access.id] : undefined;

  const [task, projects, reports, allTasks, subtasks, members] = await Promise.all([
    getWorkTask(supabase, id),
    listProjects(supabase, undefined, access.role === "member" ? access.id : undefined),
    listTaskReports(supabase, id),
    listWorkTasks(supabase, { assigneeIds: memberAssigneeIds }),
    listSubtasks(supabase, { workTaskId: id, assigneeIds: memberAssigneeIds }),
    listDirectory(supabase).then((items) => access.role === "member"
      ? items.filter((item) => item.id === access.employeeCode)
      : items),
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
      readOnly={access.role === "member"}
    />
  );
}
