import { PerformanceDashboard } from "@/components/dashboard/PerformanceDashboard";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function DashboardPage() {
  const initialData = await getDashboardData();
  return <PerformanceDashboard initialData={initialData} />;
}
