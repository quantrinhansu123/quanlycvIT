import { createServerSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import {
  getSubtask,
  listDirectory,
  listSubtaskActivity,
  listSubtaskReports,
  listWorkTasks,
} from "@/lib/supabase/data";
import { SubtaskDetailView } from "./SubtaskDetailView";

interface SubtaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SubtaskDetailPage({ params }: SubtaskDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  await assertSubtaskReadable(supabase, access, id);
  const memberAssigneeIds = access.role === "member" ? [access.id] : undefined;

  const [subtask, workTasks, reports, members, activity] = await Promise.all([
    getSubtask(supabase, id),
    listWorkTasks(supabase, { assigneeIds: memberAssigneeIds }),
    listSubtaskReports(supabase, id),
    listDirectory(supabase),
    listSubtaskActivity(supabase, id),
  ]);

  return (
    <SubtaskDetailView
      subtaskId={id}
      initialSubtask={subtask}
      initialWorkTasks={workTasks}
      initialReports={reports}
      initialMembers={members}
      initialActivity={activity.items}
      initialActivityTotal={activity.total}
    />
  );
}
