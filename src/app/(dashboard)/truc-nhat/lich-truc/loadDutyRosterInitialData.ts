import type { ApiSupabaseClient } from "@/lib/supabase/api";
import { getDutyRosterRange } from "@/lib/supabase/data";
import { getAppDateKey } from "@/lib/utils";

function monthRange(dateKey: string): { from: string; to: string } {
  const [year, month] = dateKey.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function loadDutyRosterInitialData(supabase: ApiSupabaseClient) {
  const { from, to } = monthRange(getAppDateKey());
  const initialShifts = await getDutyRosterRange(supabase, from, to);
  return { initialShifts, initialFrom: from, initialTo: to };
}
