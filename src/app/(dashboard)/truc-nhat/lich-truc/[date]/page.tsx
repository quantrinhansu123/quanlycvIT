import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { getDutyShiftByDate } from "@/lib/supabase/data";
import { DutyShiftDetailView } from "./DutyShiftDetailView";

interface DutyShiftPageProps {
  params: Promise<{ date: string }>;
}

export default async function DutyShiftPage({ params }: DutyShiftPageProps) {
  const { date } = await params;
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const shift = await getDutyShiftByDate(supabase, date);

  return (
    <DutyShiftDetailView
      date={date}
      initialShift={shift}
      accountId={access.id}
      accountRole={access.role}
      employeeCode={access.employeeCode}
    />
  );
}
