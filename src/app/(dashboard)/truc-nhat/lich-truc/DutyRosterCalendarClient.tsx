"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import type { AccountRole } from "@/types/account";
import type { DutyShift } from "@/types/duty";
import { DUTY_STATUS_META, DUTY_WEEKDAY_OPTIONS } from "@/types/duty";
import type { ProjectMember } from "@/types/project";
import { AvatarStack } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { dutyService } from "@/services/duty-service";
import { projectService } from "@/services/project-service";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { cn, getAppDateKey } from "@/lib/utils";

interface DutyRosterCalendarClientProps {
  accountId: string;
  accountRole: AccountRole;
  initialShifts: DutyShift[];
  initialFrom: string;
  initialTo: string;
  /** `undefined` khi tài khoản chỉ xem (member) — không cần nạp trước danh bạ. */
  initialMembers: ProjectMember[] | undefined;
}

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, lastDay };
}

/** Thứ trong tuần (1=Thứ 2..7=CN) của ngày đầu tháng, để canh cột lưới lịch. */
function isoWeekdayOfFirst(year: number, month: number): number {
  const day = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function DutyRosterCalendarClient({
  accountId,
  accountRole,
  initialShifts,
  initialFrom,
  initialTo,
  initialMembers,
}: DutyRosterCalendarClientProps) {
  const pathname = usePathname();
  const todayKey = getAppDateKey();
  const [initialYear, initialMonth] = initialFrom.split("-").map(Number);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const { from, to, lastDay } = useMemo(() => monthRange(year, month), [year, month]);

  const rosterKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.dutyRoster,
    filters: { from, to },
  });

  const {
    data: shiftsData,
    status,
    refresh,
  } = useSessionQuery<DutyShift[]>({
    key: rosterKey,
    fetcher: (signal) => dutyService.getRoster(from, to, { signal }),
    ttl: CACHE_TTL.list,
    initialData: from === initialFrom && to === initialTo ? initialShifts : undefined,
  });

  // Layout này (và component này bên trong nó) không remount khi mở/đóng chi
  // tiết 1 ngày, nên nạp trước danh bạ nhân sự vào session cache ở đây — trang
  // chi tiết ngày dùng lại đúng cache key này, không phải gọi mạng lần nữa.
  useSessionQuery<ProjectMember[]>({
    key:
      accountRole === "member"
        ? null
        : buildCacheKey({ accountId, role: accountRole, resource: CACHE_RESOURCE.directoryMembers }),
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: initialMembers,
  });

  const loading = status === "loading";
  const error = status === "error";

  const shiftsByDate = useMemo(
    () => new Map((shiftsData ?? []).map((shift) => [shift.date, shift])),
    [shiftsData]
  );
  const leadingBlanks = isoWeekdayOfFirst(year, month) - 1;
  const days = Array.from({ length: lastDay }, (_, index) => index + 1);

  function goToMonth(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Lịch trực nhật</h1>
          <p className="text-sm text-gray-400">
            Tháng {month}/{year}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto [scrollbar-gutter:stable]">
        <div className="grid grid-cols-7 gap-px border-b border-gray-100 bg-gray-100 text-center text-xs font-semibold text-gray-400">
          {DUTY_WEEKDAY_OPTIONS.map((weekday) => (
            <div key={weekday.value} className="bg-white py-2">
              {weekday.label}
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-7 gap-px overflow-y-auto bg-gray-100 [scrollbar-gutter:stable]">
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} className="bg-gray-50" />
          ))}
          {days.map((day) => {
            const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const shift = shiftsByDate.get(dateKey);
            const isToday = dateKey === todayKey;
            const isActive = pathname === `/truc-nhat/lich-truc/${dateKey}`;
            const isOverdue = Boolean(shift && dateKey < todayKey && shift.status !== "hoan_thanh");
            const meta = shift
              ? isOverdue
                ? { label: "Chưa hoàn thành", badge: "bg-rose-100 text-rose-600", dot: "bg-rose-500" }
                : DUTY_STATUS_META[shift.status]
              : null;
            const doneCount = shift?.checklist.filter((item) => item.done).length ?? 0;

            return (
              <Link
                key={dateKey}
                href={`/truc-nhat/lich-truc/${dateKey}`}
                className={cn(
                  "flex min-h-[112px] min-w-0 flex-col gap-1.5 bg-white p-2 text-left transition-colors hover:bg-brand-50",
                  isActive && "bg-brand-50 ring-1 ring-inset ring-brand-300"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isToday ? "bg-brand-600 text-white" : "text-gray-600"
                  )}
                >
                  {day}
                </span>
                {shift && shift.assignees.length > 0 && (
                  <div className="flex min-w-0 items-center gap-1">
                    <AvatarStack
                      people={shift.assignees.slice(0, 1).map((assignee) => ({
                        name: assignee.name,
                        avatarColor: assignee.avatarColor,
                      }))}
                      max={1}
                    />
                    <span className="min-w-0 truncate text-xs font-medium text-gray-700">
                      {shift.assignees[0].name}
                    </span>
                    {shift.assignees.length > 1 && (
                      <span className="shrink-0 text-[10px] font-semibold text-gray-400">
                        +{shift.assignees.length - 1}
                      </span>
                    )}
                  </div>
                )}
                {shift && shift.assignees.length > 0 ? (
                  <div className="mt-auto flex items-center justify-between gap-1">
                    {meta && (
                      <>
                        <span
                          className={cn("h-2 w-2 shrink-0 rounded-full sm:hidden", meta.dot)}
                          title={meta.label}
                        />
                        <span
                          className={cn(
                            "hidden w-fit items-center rounded-md px-1.5 py-0.5 text-xs font-semibold sm:inline-flex",
                            meta.badge
                          )}
                        >
                          {meta.label}
                        </span>
                      </>
                    )}
                    {shift.checklist.length > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                        <ListChecks className="h-3.5 w-3.5" />
                        {doneCount}/{shift.checklist.length}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="hidden text-xs text-gray-300 sm:block">Chưa phân công</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {loading && <p className="px-5 py-2 text-sm text-gray-400">Đang tải...</p>}
    </div>
  );
}
