import Link from "next/link";
import {
  CalendarRange,
  ChevronRight,
  CircleCheck,
  Clock3,
  ListChecks,
  UserRound,
} from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { cn, formatDateVN } from "@/lib/utils";
import type { ProjectMember } from "@/types/project";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from "@/types/task";

export interface ActivityTimelineItem {
  id: string;
  title: string;
  description?: string;
  href: string;
  status: TaskStatus;
  priority?: TaskPriority;
  assignees: ProjectMember[];
  startDate?: string;
  dueDate?: string;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ActivityTimelineProps {
  items: ActivityTimelineItem[];
  itemLabel: "Công việc" | "Task";
  emptyTitle: string;
  emptyDescription: string;
}

function validTime(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function formatRelativeTime(value?: string): string {
  const time = validTime(value);
  if (!time) return "";

  const distance = Date.now() - time;
  if (distance < 0) return formatDateVN(value ?? "");

  const minutes = Math.floor(distance / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;

  return formatDateVN(value ?? "");
}

function formatDateRange(startDate?: string, dueDate?: string): string {
  const start = startDate ? formatDateVN(startDate) : "";
  const due = dueDate ? formatDateVN(dueDate) : "";
  if (start && due) return `${start} - ${due}`;
  if (due) return `Hạn ${due}`;
  if (start) return `Bắt đầu ${start}`;
  return "Chưa đặt thời gian";
}

export function ActivityTimeline({
  items,
  itemLabel,
  emptyTitle,
  emptyDescription,
}: ActivityTimelineProps) {
  const sortedItems = [...items].sort((left, right) => {
    const leftTime =
      validTime(left.updatedAt) ||
      validTime(left.createdAt) ||
      validTime(left.startDate) ||
      validTime(left.dueDate);
    const rightTime =
      validTime(right.updatedAt) ||
      validTime(right.createdAt) ||
      validTime(right.startDate) ||
      validTime(right.dueDate);
    return rightTime - leftTime;
  });

  if (sortedItems.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 text-center">
        <ListChecks className="h-9 w-9 text-gray-300" />
        <p className="mt-3 text-sm font-bold text-gray-800">{emptyTitle}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-gray-400">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[460px] overflow-y-auto pr-1">
      <div className="relative space-y-4 py-1 pl-12 sm:pl-14">
        <div
          aria-hidden="true"
          className="absolute bottom-4 left-[19px] top-4 w-px bg-gradient-to-b from-violet-300 via-brand-200 to-emerald-200 sm:left-[23px]"
        />

        {sortedItems.map((item) => {
          const statusMeta = TASK_STATUS_META[item.status];
          const priorityMeta = item.priority
            ? TASK_PRIORITY_META[item.priority]
            : null;
          const activityTime = item.updatedAt || item.createdAt;
          const progress = Math.max(0, Math.min(100, item.progress ?? 0));

          return (
            <article key={item.id} className="group relative">
              <span className="absolute -left-12 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 shadow-sm transition group-hover:scale-105 group-hover:border-violet-300 group-hover:bg-violet-100 sm:-left-14 sm:h-11 sm:w-11">
                {item.status === "done" ? (
                  <CircleCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </span>

              <Link
                href={item.href}
                className="block rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-bold leading-5 text-gray-900">
                      [{itemLabel}] {item.title}
                    </p>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {activityTime && (
                      <span className="hidden text-xs text-gray-400 sm:inline">
                        {formatRelativeTime(activityTime)}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      statusMeta.badge
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                    {statusMeta.label}
                  </span>

                  {priorityMeta && (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        priorityMeta.badge
                      )}
                    >
                      {priorityMeta.label}
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {formatDateRange(item.startDate, item.dueDate)}
                  </span>

                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    Tiến độ {progress}%
                  </span>

                  <div className="ml-auto flex min-w-0 items-center gap-2">
                    {item.assignees.length > 0 ? (
                      <>
                        <AvatarStack people={item.assignees} max={3} size="sm" />
                        <span className="hidden max-w-40 truncate text-[11px] font-medium text-gray-600 md:inline">
                          {item.assignees.map((member) => member.name).join(", ")}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <UserRound className="h-3.5 w-3.5" />
                        Chưa phân công
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
