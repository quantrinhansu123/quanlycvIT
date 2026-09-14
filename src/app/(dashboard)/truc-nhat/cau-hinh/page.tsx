import { ShieldAlert } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import { DutyConfigPage } from "@/components/duty/DutyConfigPage";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DutyConfigRoutePage() {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);

  if (access.role === "member") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Bạn không có quyền truy cập trang này"
          description="Chỉ quản trị viên và quản lý mới có thể cấu hình lịch trực nhật."
        />
      </div>
    );
  }

  return <DutyConfigPage />;
}
