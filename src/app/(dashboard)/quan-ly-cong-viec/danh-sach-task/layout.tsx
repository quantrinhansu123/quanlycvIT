import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { ListDetailRouteShell } from "@/components/layout/ListDetailRouteShell";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SubtaskListClient } from "./SubtaskListClient";
import { loadSubtaskListInitialData } from "./loadSubtaskListInitialData";

async function SubtaskListPanel() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const { initialSubtasks } = await loadSubtaskListInitialData(supabase, access);

  return (
    <SubtaskListClient
      accountId={access.id}
      accountRole={access.role}
      initialSubtasks={initialSubtasks}
    />
  );
}

function SubtaskListFallback() {
  return (
    <div className="h-full overflow-hidden bg-white p-4">
      <TableSkeleton rows={5} />
    </div>
  );
}

export default function SubtaskListLayout({ children }: { children: React.ReactNode }) {
  return (
    <ListDetailRouteShell
      basePath="/quan-ly-cong-viec/danh-sach-task"
      listSlot={
        <Suspense fallback={<SubtaskListFallback />}>
          <SubtaskListPanel />
        </Suspense>
      }
    >
      {children}
    </ListDetailRouteShell>
  );
}
