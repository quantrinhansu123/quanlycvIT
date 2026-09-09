import { createServerSupabaseClient } from "@/lib/supabase/api";
import { assertSubtaskReadable, requireRequestAccount } from "@/lib/supabase/authorization";
import { getSubtask, getWorkTaskDirectoryItem } from "@/lib/supabase/data";
import { SubtaskDetailView } from "./SubtaskDetailView";

interface SubtaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SubtaskDetailPage({ params }: SubtaskDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  // Song song ACL + task; chỉ lấy 1 công việc cha — không tải cả directory/members.
  const [, subtask] = await Promise.all([
    assertSubtaskReadable(supabase, access, id),
    getSubtask(supabase, id),
  ]);
  const parentWorkTask = subtask
    ? await getWorkTaskDirectoryItem(supabase, subtask.workTaskId)
    : null;

  return (
    <SubtaskDetailView
      subtaskId={id}
      initialSubtask={subtask}
      initialWorkTasks={parentWorkTask ? [parentWorkTask] : []}
      initialReports={[]}
      initialMembers={[]}
      initialActivity={[]}
      initialActivityTotal={0}
      initialTestHistory={[]}
    />
  );
}
