import { redirect } from "next/navigation";
import { AttendanceManagementPage } from "@/components/accounts/AttendanceManagementPage";
import { getServerAccountProfile } from "@/lib/supabase/authorization";

export default async function EmployeeAttendancePage() {
  const profile = await getServerAccountProfile();
  if (!profile) redirect("/dang-nhap");
  if (profile.role === "member") redirect("/");
  return <AttendanceManagementPage />;
}
