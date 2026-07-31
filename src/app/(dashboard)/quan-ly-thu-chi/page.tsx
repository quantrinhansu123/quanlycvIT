import type { Metadata } from "next";
import { FinanceManagementPage } from "@/components/finance/FinanceManagementPage";

export const metadata: Metadata = { title: "Quản lý thu chi" };

export default function FinancePage() { return <FinanceManagementPage />; }
