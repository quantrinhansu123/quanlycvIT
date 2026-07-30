import { createServerSupabaseClient } from "@/lib/supabase/api";
import {
  getSubtask,
  listDirectory,
  listSubtaskReports,
  listWorkTasks,
} from "@/lib/supabase/data";
import { SubtaskDetailView } from "./SubtaskDetailView";

interface SubtaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SubtaskDetailPage({ params }: SubtaskDetailPageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [subtask, workTasks, reports, members] = await Promise.all([
    getSubtask(supabase, id),
    listWorkTasks(supabase),
    listSubtaskReports(supabase, id),
    listDirectory(supabase),
  ]);

  return (
    <SubtaskDetailView
      subtaskId={id}
      initialSubtask={subtask}
      initialWorkTasks={workTasks}
      initialReports={reports}
      initialMembers={members}
    />
  );
}
