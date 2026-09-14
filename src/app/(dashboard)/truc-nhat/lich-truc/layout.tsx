import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { listDirectory } from "@/lib/supabase/data";
import { ListDetailRouteShell } from "@/components/layout/ListDetailRouteShell";
import { DutyRosterCalendarClient } from "./DutyRosterCalendarClient";
import { loadDutyRosterInitialData } from "./loadDutyRosterInitialData";

export default async function DutyRosterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const isReadOnly = access.role === "member";

  // Layout này không remount khi điều hướng giữa các ngày trong cùng tháng
  // (chỉ [date]/page.tsx re-render), nên fetch danh bạ nhân sự ở đây đúng 1 lần
  // rồi để DutyRosterCalendarClient nạp sẵn vào session cache — tránh mỗi lần
  // bấm sang ngày khác lại phải gọi lại listDirectory từ đầu.
  const [{ initialShifts, initialFrom, initialTo }, initialMembers] = await Promise.all([
    loadDutyRosterInitialData(supabase),
    isReadOnly ? Promise.resolve(undefined) : listDirectory(supabase),
  ]);

  return (
    <ListDetailRouteShell
      basePath="/truc-nhat/lich-truc"
      listSlot={
        <DutyRosterCalendarClient
          accountId={access.id}
          accountRole={access.role}
          initialShifts={initialShifts}
          initialFrom={initialFrom}
          initialTo={initialTo}
          initialMembers={initialMembers}
        />
      }
    >
      {children}
    </ListDetailRouteShell>
  );
}
