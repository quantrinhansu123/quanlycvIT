import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { ListDetailRouteShell } from "@/components/layout/ListDetailRouteShell";
import { SubtaskListClient } from "./SubtaskListClient";
import { loadSubtaskListInitialData } from "./loadSubtaskListInitialData";

export default async function SubtaskListLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialSubtasks, initialWorkTasks, initialMembers, initialProjects } =
    await loadSubtaskListInitialData(supabase, access);

  return (
    <ListDetailRouteShell
      basePath="/quan-ly-cong-viec/danh-sach-task"
      listSlot={
        <SubtaskListClient
          accountId={access.id}
          accountRole={access.role}
          initialSubtasks={initialSubtasks}
          initialWorkTasks={initialWorkTasks}
          initialMembers={initialMembers}
          initialProjects={initialProjects}
        />
      }
    >
      {children}
    </ListDetailRouteShell>
  );
}
