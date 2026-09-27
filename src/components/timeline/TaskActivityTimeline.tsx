import {
  CalendarDays,
  CircleCheck,
  Clock3,
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

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  inProgress: "Đang làm",
  testing: "Đang kiểm thử",
  review: "Chờ duyệt",
  done: "Hoàn thành",
};

function formatActivityContent(detail?: Record<string, unknown>): string {
  if (!detail || Object.keys(detail).length === 0) return "Không có nội dung chi tiết";

  if (typeof detail.tien_do === "number") {
    return `Tiến độ báo cáo: ${detail.tien_do}%`;
  }

  if (typeof detail.tu === "string" && typeof detail.den === "string") {
    return `Trạng thái: ${TASK_STATUS_LABELS[detail.tu] ?? detail.tu} → ${TASK_STATUS_LABELS[detail.den] ?? detail.den}`;
  }

  const entries = Object.entries(detail).map(([key, value]) => {
    const label = key === "trang_thai" ? "Trạng thái" : key;
    const text = typeof value === "string" && key === "trang_thai"
      ? TASK_STATUS_LABELS[value] ?? value
      : String(value);
    return `${label}: ${text}`;
  });
  return entries.join(" · ");
}

function formatActivityTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      meta.badge
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Kết quả</dt>
                    <dd className="mt-0.5 break-words text-xs font-medium text-gray-800">{event.title}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Nội dung</dt>
                    <dd className="mt-0.5 break-words text-xs text-gray-600">{formatActivityContent(event.detail)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Người thực hiện</dt>
                    <dd className="mt-0.5 truncate text-xs font-medium text-gray-700">{event.actorName ?? "Không xác định"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Thời gian</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600" title={formatActivityTimestamp(event.createdAt)}>
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <time dateTime={event.createdAt}>{formatRelativeTime(event.createdAt) || formatActivityTimestamp(event.createdAt)}</time>
                    </dd>
                  </div>
                </dl>
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
