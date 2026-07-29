import { AlertTriangle, Flag } from "lucide-react";
import { TASK_PRIORITY_META, TASK_STATUS_META, type TaskPriority, type TaskStatus } from "@/types/task";
import { cn } from "@/lib/utils";

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = TASK_STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold", meta.badge, className)}>
      {meta.label}
    </span>
  );
}

export function TaskPriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = TASK_PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold uppercase",
        meta.badge,
        className
      )}
    >
      {priority === "urgent" && <Flag className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

export function OverdueTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600",
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      Trễ
    </span>
  );
}
