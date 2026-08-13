import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { getDutyShiftByDate, listDirectory } from "@/lib/supabase/data";
import { DutyShiftDetailView } from "./DutyShiftDetailView";

interface DutyShiftPageProps {
  params: Promise<{ date: string }>;
}

export default async function DutyShiftPage({ params }: DutyShiftPageProps) {
  const { date } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const [shift, members] = await Promise.all([
    getDutyShiftByDate(supabase, date),
    listDirectory(supabase),
  ]);

  return (
    <DutyShiftDetailView
      date={date}
      initialShift={shift}
      members={members}
      accountRole={access.role}
      employeeCode={access.employeeCode}
    />
  );
}
