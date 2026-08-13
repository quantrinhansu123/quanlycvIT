"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import type { DutyShift } from "@/types/duty";
import { DUTY_STATUS_META, DUTY_WEEKDAY_OPTIONS } from "@/types/duty";
import { AvatarStack } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { dutyService } from "@/services/duty-service";
import { cn, getAppDateKey } from "@/lib/utils";

interface DutyRosterCalendarClientProps {
  initialShifts: DutyShift[];
  initialFrom: string;
  initialTo: string;
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
  initialShifts,
  initialFrom,
  initialTo,
}: DutyRosterCalendarClientProps) {
  const pathname = usePathname();
  const todayKey = getAppDateKey();
  const [initialYear, initialMonth] = initialFrom.split("-").map(Number);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [shifts, setShifts] = useState<DutyShift[]>(initialShifts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const { from, to, lastDay } = useMemo(() => monthRange(year, month), [year, month]);

  const loadMonth = useCallback(async (targetFrom: string, targetTo: string) => {
    setLoading(true);
    setError(false);
    try {
      setShifts(await dutyService.getRoster(targetFrom, targetTo));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (from === initialFrom && to === initialTo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShifts(initialShifts);
      return;
    }
    void loadMonth(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const shiftsByDate = useMemo(() => new Map(shifts.map((shift) => [shift.date, shift])), [shifts]);
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
          <h1 className="text-base font-bold text-gray-900">Lịch trực nhật</h1>
          <p className="text-xs text-gray-400">
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

      <div className="grid grid-cols-7 gap-px border-b border-gray-100 bg-gray-100 text-center text-[11px] font-semibold text-gray-400">
        {DUTY_WEEKDAY_OPTIONS.map((weekday) => (
          <div key={weekday.value} className="bg-white py-2">
            {weekday.label}
          </div>
        ))}
      </div>

      {error ? (
        <ErrorState onRetry={() => loadMonth(from, to)} />
      ) : (
        <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-y-auto bg-gray-100">
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`blank-${index}`} className="bg-gray-50" />
          ))}
          {days.map((day) => {
            const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const shift = shiftsByDate.get(dateKey);
            const isToday = dateKey === todayKey;
            const isActive = pathname === `/truc-nhat/lich-truc/${dateKey}`;
            const meta = shift ? DUTY_STATUS_META[shift.status] : null;
            const doneCount = shift?.checklist.filter((item) => item.done).length ?? 0;

            return (
              <Link
                key={dateKey}
                href={`/truc-nhat/lich-truc/${dateKey}`}
                className={cn(
                  "flex min-h-[92px] flex-col gap-1.5 bg-white p-2 text-left transition-colors hover:bg-brand-50",
                  isActive && "bg-brand-50 ring-1 ring-inset ring-brand-300"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-brand-600 text-white" : "text-gray-600"
                  )}
                >
                  {day}
                </span>
                {shift && shift.assignees.length > 0 ? (
                  <>
                    <AvatarStack
                      people={shift.assignees.map((assignee) => ({
                        name: assignee.name,
                        avatarColor: assignee.avatarColor,
                      }))}
                      max={3}
                    />
                    {meta && (
                      <span
                        className={cn(
                          "inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          meta.badge
                        )}
                      >
                        {meta.label}
                      </span>
                    )}
                    {shift.checklist.length > 0 && (
                      <span className="mt-auto flex items-center gap-1 text-[10px] text-gray-400">
                        <ListChecks className="h-3 w-3" />
                        {doneCount}/{shift.checklist.length}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-gray-300">Chưa phân công</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {loading && <p className="px-5 py-2 text-xs text-gray-400">Đang tải...</p>}
    </div>
  );
}
