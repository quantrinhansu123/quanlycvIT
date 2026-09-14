import {
  CalendarDays,
  CircleCheck,
  FileClock,
  ListChecks,
  Pencil,
  PlayCircle,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/components/timeline/ActivityTimeline";
import { Button } from "@/components/ui/Button";
import {
  TASK_ACTIVITY_META,
  type TaskActivityEvent,
  type TaskActivityType,
} from "@/types/activity";

const ACTIVITY_ICONS: Record<TaskActivityType, LucideIcon> = {
  created: FileClock,
  accepted: UserCheck,
  status_changed: PlayCircle,
  progress_reported: ListChecks,
  approved: CircleCheck,
  edited: Pencil,
};

interface TaskActivityTimelineProps {
  events: TaskActivityEvent[];
  /** Còn sự kiện cũ hơn chưa tải (phân trang) — hiển thị nút "Xem thêm". */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/** Nhật ký hoạt động Task: tạo, xác nhận, đổi trạng thái, báo cáo, duyệt, sửa. */
export function TaskActivityTimeline({
  events,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: TaskActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 text-center">
        <CalendarDays className="h-9 w-9 text-gray-300" />
        <p className="mt-3 text-sm font-bold text-gray-800">
          Chưa có lịch sử hoạt động
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Các cập nhật trạng thái, phân công và báo cáo
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[460px] overflow-y-auto pr-1">
      <div className="relative space-y-3 py-1 pl-11 sm:pl-12">
        <div
          aria-hidden="true"
          className="absolute bottom-3 left-[15px] top-3 w-px bg-gradient-to-b from-violet-300 via-brand-200 to-emerald-200 sm:left-[19px]"
        />

        {events.map((event) => {
          const meta = TASK_ACTIVITY_META[event.type];
          const Icon = ACTIVITY_ICONS[event.type];

          return (
            <article key={event.id} className="relative">
              <span className="absolute -left-11 top-1 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 shadow-sm sm:-left-12 sm:h-9 sm:w-9">
                <Icon className="h-4 w-4" />
              </span>

              <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold leading-5 text-gray-900">
                    {event.title}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      meta.badge
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                  {event.actorName && (
                    <span className="text-[11px] text-gray-500">
                      bởi {event.actorName}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {hasMore && (
          <div className="pt-1 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Đang tải..." : "Xem thêm hoạt động"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
