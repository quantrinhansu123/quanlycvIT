import { EmployeeDetailPage } from "@/components/accounts/EmployeeDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetailPage employeeId={id} />;
}
