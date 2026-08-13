import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { ListDetailRouteShell } from "@/components/layout/ListDetailRouteShell";
import { DutyRosterCalendarClient } from "./DutyRosterCalendarClient";
import { loadDutyRosterInitialData } from "./loadDutyRosterInitialData";

export default async function DutyRosterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  await requireRequestAccount(supabase);
  const { initialShifts, initialFrom, initialTo } = await loadDutyRosterInitialData(supabase);

  return (
    <ListDetailRouteShell
      basePath="/truc-nhat/lich-truc"
      listSlot={
        <DutyRosterCalendarClient
          initialShifts={initialShifts}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      }
    >
      {children}
    </ListDetailRouteShell>
  );
}
