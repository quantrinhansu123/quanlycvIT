"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  getWeekDays,
  rangeOverlapsWeek,
  getBarPosition,
  toISODateStr,
  WEEKDAY_FULL_LABELS,
  type CalendarDay,
} from "@/lib/calendar-utils";
import { formatSpan } from "@/lib/utils";
import type { WorkTask } from "@/types/task";
import type { Project } from "@/types/project";
import { PROJECT_COLORS } from "@/types/project";
import { Avatar } from "@/components/ui/Avatar";
import type { ProjectMember } from "@/types/project";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WeekTaskBar {
  task: WorkTask;
  project?: Project;
  assignee?: ProjectMember;
}

interface WeekCalendarProps {
  weekStart: Date;
  selectedDate?: Date;
  mode?: "week" | "day";
  tasks: WorkTask[];
  projectsById: Map<string, Project>;
  membersById: Map<string, ProjectMember>;
  onTaskClick?: (task: WorkTask) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // px per hour row
const INITIAL_SCROLL_HOUR = 5.75; // keep the 06:00 label fully visible
const MAX_ALLDAY_LANES = 3;
const DAY_VIEW_LABELS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

/* ------------------------------------------------------------------ */
/*  Color helpers (same logic as DeadlineCalendar)                     */
/* ------------------------------------------------------------------ */

function getProjectBgClass(color?: string): string {
  switch (color) {
    case "purple": return "bg-violet-500";
    case "green": return "bg-emerald-500";
    case "orange": return "bg-amber-500";
    case "red": return "bg-rose-500";
    case "blue": return "bg-sky-500";
    default: return "bg-gray-500";
  }
}

function getProjectHoverClass(color?: string): string {
  switch (color) {
    case "purple": return "hover:bg-violet-600";
    case "green": return "hover:bg-emerald-600";
    case "orange": return "hover:bg-amber-600";
    case "red": return "hover:bg-rose-600";
    case "blue": return "hover:bg-sky-600";
    default: return "hover:bg-gray-600";
  }
}

function getProjectHex(color?: string): string {
  const match = PROJECT_COLORS.find((c) => c.value === color);
  return match?.hex ?? "#6B7280";
}

function getProjectLightBg(color?: string): string {
  switch (color) {
    case "purple": return "bg-violet-50 border-violet-200";
    case "green": return "bg-emerald-50 border-emerald-200";
    case "orange": return "bg-amber-50 border-amber-200";
    case "red": return "bg-rose-50 border-rose-200";
    case "blue": return "bg-sky-50 border-sky-200";
    default: return "bg-gray-50 border-gray-200";
  }
}

function getProjectTextClass(color?: string): string {
  switch (color) {
    case "purple": return "text-violet-700";
    case "green": return "text-emerald-700";
    case "orange": return "text-amber-700";
    case "red": return "text-rose-700";
    case "blue": return "text-sky-700";
    default: return "text-gray-700";
  }
}

/* ------------------------------------------------------------------ */
/*  All-day lane allocation (reuse pattern from DeadlineCalendar)      */
/* ------------------------------------------------------------------ */

function allocateAllDayLanes(
  days: CalendarDay[],
  bars: WeekTaskBar[]
): { lane: number; bar: WeekTaskBar; startCol: number; span: number }[] {
  const weekStart = days[0].dateStr;
  const weekEnd = days[days.length - 1].dateStr;

  const overlapping = bars.filter((b) =>
    rangeOverlapsWeek(b.task.startDate, b.task.dueDate, weekStart, weekEnd)
  );

  overlapping.sort((a, b) => {
    if (a.task.startDate !== b.task.startDate)
      return a.task.startDate < b.task.startDate ? -1 : 1;
    const spanA = new Date(a.task.dueDate).getTime() - new Date(a.task.startDate).getTime();
    const spanB = new Date(b.task.dueDate).getTime() - new Date(b.task.startDate).getTime();
    return spanB - spanA;
  });

  const lanes: { endCol: number }[] = [];
  const allocated: { lane: number; bar: WeekTaskBar; startCol: number; span: number }[] = [];

  for (const bar of overlapping) {
    const { startCol, span } = getBarPosition(
      bar.task.startDate,
      bar.task.dueDate,
      weekStart,
      weekEnd
    );

    let assignedLane = -1;
    for (let li = 0; li < lanes.length; li++) {
      if (lanes[li].endCol < startCol) {
        assignedLane = li;
        lanes[li].endCol = startCol + span - 1;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push({ endCol: startCol + span - 1 });
    }

    allocated.push({ lane: assignedLane, bar, startCol, span });
  }

  return allocated;
}

/* ------------------------------------------------------------------ */
/*  Current time indicator position                                    */
/* ------------------------------------------------------------------ */

function getCurrentTimePosition(): { hour: number; minuteFraction: number } | null {
  const now = new Date();
  return { hour: now.getHours(), minuteFraction: now.getMinutes() / 60 };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WeekCalendar({
  weekStart,
  selectedDate,
  mode = "week",
  tasks,
  projectsById,
  membersById,
  onTaskClick,
}: WeekCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDayView = mode === "day";

  const days = useMemo(() => {
    if (!isDayView) return getWeekDays(weekStart);

    const date = selectedDate ?? weekStart;
    const dateStr = toISODateStr(date);
    return [
      {
        dateStr,
        day: date.getDate(),
        isCurrentMonth: true,
        isToday: dateStr === toISODateStr(new Date()),
      },
    ];
  }, [isDayView, selectedDate, weekStart]);
  const columnCount = days.length;

  const weekStartStr = days[0].dateStr;
  const weekEndStr = days[days.length - 1].dateStr;

  // Build task bars for tasks that overlap this week
  const bars: WeekTaskBar[] = useMemo(
    () =>
      tasks
        .filter((t) => rangeOverlapsWeek(t.startDate, t.dueDate, weekStartStr, weekEndStr))
        .map((task) => ({
          task,
          project: projectsById.get(task.projectId),
          assignee: membersById.get(task.assigneeId),
        })),
    [tasks, projectsById, membersById, weekStartStr, weekEndStr]
  );

  // Separate single-day tasks vs multi-day tasks
  const singleDayBars = useMemo(
    () => bars.filter((b) => b.task.startDate === b.task.dueDate),
    [bars]
  );

  const multiDayBars = useMemo(
    () => bars.filter((b) => b.task.startDate !== b.task.dueDate),
    [bars]
  );

  // All-day lane allocation for multi-day tasks
  const allDayLanes = useMemo(
    () => allocateAllDayLanes(days, multiDayBars),
    [days, multiDayBars]
  );

  const allDayMaxLane = allDayLanes.reduce((max, l) => Math.max(max, l.lane), -1);
  const allDayTotalLanes = allDayMaxLane + 1;
  const allDayVisibleLanes = Math.min(allDayTotalLanes, MAX_ALLDAY_LANES);
  const allDayHidden = allDayTotalLanes - allDayVisibleLanes;

  // Group single-day tasks by date for rendering in the hourly grid
  const tasksByDate = useMemo(() => {
    const map = new Map<string, WeekTaskBar[]>();
    for (const bar of singleDayBars) {
      const dateStr = bar.task.startDate;
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(bar);
    }
    return map;
  }, [singleDayBars]);

  // Current time position
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const todayColumnIndex = days.findIndex((d) => d.dateStr === todayStr);
  const timePos = getCurrentTimePosition();

  // Luôn mở lịch ở đầu giờ làm việc sau khi đổi chế độ hoặc đổi ngày.
  useLayoutEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;

    const targetScrollTop = INITIAL_SCROLL_HOUR * HOUR_HEIGHT;
    scrollArea.scrollTop = targetScrollTop;
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = targetScrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, weekStartStr]);

  return (
    <div
      data-calendar-view={mode}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
    >
      {/* Sticky header */}
      <div className="shrink-0 border-b border-gray-100">
        {/* Day labels row */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `76px repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {/* Time gutter header */}
          <div className="border-r border-gray-100" />
          {/* Day columns */}
          {days.map((day, i) => (
            <div
              key={day.dateStr}
              className={`border-r border-gray-100 px-2 py-3 text-center last:border-r-0 ${
                day.isToday ? "bg-blue-50/60" : ""
              }`}
            >
              <div
                className={`font-semibold tracking-wide ${
                  isDayView
                    ? "text-sm text-gray-900"
                    : `text-xs ${
                        i === 0 || i === 6
                          ? "text-rose-400"
                          : "text-gray-500"
                      }`
                }`}
              >
                {isDayView
                  ? DAY_VIEW_LABELS[(selectedDate ?? weekStart).getDay()]
                  : `${WEEKDAY_FULL_LABELS[i]} ${day.day}/${Number(day.dateStr.slice(5, 7))}`}
              </div>
            </div>
          ))}
        </div>

        {/* All-day row */}
        <div
          className="grid border-t border-gray-100"
          style={{ gridTemplateColumns: `76px repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {/* Label */}
          <div className="flex items-center justify-center border-r border-gray-100 px-1 py-2">
            <span className="text-[11px] font-medium text-gray-400">all-day</span>
          </div>
          {/* All-day content area */}
          <div
            className="relative"
            style={{
              gridColumn: `span ${columnCount} / span ${columnCount}`,
              minHeight:
                `${Math.max(56, allDayVisibleLanes * 28 + 8)}px`,
            }}
          >
            {/* Background columns */}
            <div
              className="pointer-events-none absolute inset-0 grid"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
            >
              {days.map((day) => (
                <div
                  key={day.dateStr}
                  className={`border-r border-gray-50 last:border-r-0 ${
                    day.isToday ? "bg-blue-50/60" : ""
                  }`}
                />
              ))}
            </div>

            {/* Task bars */}
            {allDayLanes
              .filter((l) => l.lane < MAX_ALLDAY_LANES)
              .map(({ lane, bar, startCol, span }) => {
                const isStartClipped = bar.task.startDate < weekStartStr;
                const isEndClipped = bar.task.dueDate > weekEndStr;
                const spanLabel = formatSpan(bar.task.startDate, bar.task.dueDate);
                const projectCode = bar.project?.code ?? "";
                const projectColor = bar.project?.color;
                const bgClass = getProjectBgClass(projectColor);
                const hoverClass = getProjectHoverClass(projectColor);
                const hexColor = getProjectHex(projectColor);
                const leftPercent = (startCol / columnCount) * 100;
                const widthPercent = (span / columnCount) * 100;

                return (
                  <div
                    key={`allday-${bar.task.id}`}
                    className="absolute px-0.5"
                    style={{
                      top: `${lane * 28 + 4}px`,
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      height: "24px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onTaskClick?.(bar.task)}
                      className={`group relative flex h-full w-full items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-[11px] font-medium text-white shadow-sm transition-all cursor-pointer hover:shadow-md hover:brightness-110 ${bgClass} ${hoverClass} ${
                        isStartClipped && isEndClipped
                          ? ""
                          : isStartClipped
                            ? "rounded-r-md"
                            : isEndClipped
                              ? "rounded-l-md"
                              : "rounded-md"
                      }`}
                      title={`[${projectCode}] ${bar.task.title} (${spanLabel})`}
                    >
                      <span className="truncate text-left">
                        [{projectCode}] {bar.task.title}
                        {!isEndClipped && ` (${spanLabel})`}
                      </span>

                      {!isEndClipped && bar.assignee && (
                        <span className="ml-auto shrink-0">
                          <Avatar
                            name={bar.assignee.name}
                            color={bar.assignee.avatarColor}
                            size="sm"
                            className="!h-5 !w-5 !text-[8px] !ring-1"
                          />
                        </span>
                      )}

                      {/* Tooltip */}
                      <div
                        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                        style={{ minWidth: "220px" }}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: hexColor }}
                          />
                          <span className="text-left font-semibold text-gray-900">
                            [{projectCode}] {bar.task.title}
                          </span>
                        </div>
                        <div className="text-left text-gray-500">
                          Thời gian: {spanLabel}
                        </div>
                        {bar.assignee && (
                          <div className="mt-0.5 text-left text-gray-500">
                            Phụ trách: {bar.assignee.name}
                          </div>
                        )}
                        <div className="mt-1 text-left text-[10px] text-gray-400">
                          Click để xem chi tiết
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}

            {allDayHidden > 0 && (
              <div
                className="absolute right-2 text-[10px] font-medium text-gray-400"
                style={{ top: `${allDayVisibleLanes * 28 + 4}px` }}
              >
                +{allDayHidden} khác
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable hourly grid */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Grid lines and hour labels */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 grid"
              style={{
                top: `${hour * HOUR_HEIGHT}px`,
                height: `${HOUR_HEIGHT}px`,
                gridTemplateColumns: `76px repeat(${columnCount}, minmax(0, 1fr))`,
              }}
            >
              {/* Hour label */}
              <div
                className={`flex items-start justify-end border-r border-gray-100 pr-2 ${
                  hour === 0 ? "pt-2" : "pt-0"
                }`}
              >
                <span
                  className={`text-[11px] font-medium text-gray-400 ${
                    hour === 0 ? "" : "relative -top-[9px]"
                  }`}
                >
                  {String(hour).padStart(2, "0")} giờ
                </span>
              </div>
              {/* Day columns */}
              {days.map((day) => (
                <div
                  key={`${hour}-${day.dateStr}`}
                  className={`border-b border-r border-gray-50 last:border-r-0 ${
                    day.isToday ? "bg-blue-50/30" : ""
                  }`}
                />
              ))}
            </div>
          ))}

          {/* Current time indicator */}
          {todayColumnIndex >= 0 && timePos && (
            <>
              {/* Red line across the today column */}
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  top: `${(timePos.hour + timePos.minuteFraction) * HOUR_HEIGHT}px`,
                  left: `calc(76px + (100% - 76px) * ${todayColumnIndex} / ${columnCount})`,
                  width: `calc((100% - 76px) / ${columnCount})`,
                  /* We use a more precise calc below */
                }}
              />
              {/* Red dot + line spanning the full width from today column */}
              <div
                className="pointer-events-none absolute z-20 flex items-center"
                style={{
                  top: `${(timePos.hour + timePos.minuteFraction) * HOUR_HEIGHT - 4}px`,
                  left: "76px",
                  right: 0,
                }}
              >
                {/* Spacer for columns before today */}
                {todayColumnIndex > 0 && (
                  <div
                    style={{
                      width: `${(todayColumnIndex / columnCount) * 100}%`,
                    }}
                  />
                )}
                {/* Red dot */}
                <div
                  className="relative flex items-center"
                  style={{ width: `${(1 / columnCount) * 100}%` }}
                >
                  <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-red-500 shadow-sm" />
                  <div className="h-[2px] w-full bg-red-500" />
                </div>
              </div>
            </>
          )}

          {/* Render single-day tasks in the hourly grid */}
          {days.map((day, dayIdx) => {
            const dayTasks = tasksByDate.get(day.dateStr) ?? [];
            if (dayTasks.length === 0) return null;

            return dayTasks.map((bar, taskIdx) => {
              const projectColor = bar.project?.color;
              const projectCode = bar.project?.code ?? "";
              const lightBg = getProjectLightBg(projectColor);
              const textClass = getProjectTextClass(projectColor);
              const hexColor = getProjectHex(projectColor);

              // Place single-day tasks at 8:00 by default, stacked
              const topHour = 8;
              const topPx = topHour * HOUR_HEIGHT + taskIdx * 28 + 2;

              return (
                <div
                  key={`single-${bar.task.id}`}
                  className="absolute z-10 px-0.5"
                  style={{
                    top: `${topPx}px`,
                    left: `calc(76px + (100% - 76px) * ${dayIdx} / ${columnCount})`,
                    width: `calc((100% - 76px) / ${columnCount})`,
                    height: "26px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onTaskClick?.(bar.task)}
                    className={`group relative flex h-full w-full items-center gap-1 overflow-hidden rounded-md border px-2 text-[11px] font-medium shadow-sm transition-all cursor-pointer hover:shadow-md ${lightBg} ${textClass}`}
                    title={`[${projectCode}] ${bar.task.title}`}
                  >
                    <span
                      className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: hexColor }}
                    />
                    <span className="truncate">
                      [{projectCode}] {bar.task.title}
                    </span>

                    {bar.assignee && (
                      <span className="ml-auto shrink-0">
                        <Avatar
                          name={bar.assignee.name}
                          color={bar.assignee.avatarColor}
                          size="sm"
                          className="!h-4 !w-4 !text-[7px] !ring-1"
                        />
                      </span>
                    )}

                    {/* Tooltip */}
                    <div
                      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                      style={{ minWidth: "200px" }}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: hexColor }}
                        />
                        <span className="text-left font-semibold text-gray-900">
                          [{projectCode}] {bar.task.title}
                        </span>
                      </div>
                      <div className="text-left text-gray-500">
                        Ngày: {bar.task.startDate}
                      </div>
                      {bar.assignee && (
                        <div className="mt-0.5 text-left text-gray-500">
                          Phụ trách: {bar.assignee.name}
                        </div>
                      )}
                      <div className="mt-1 text-left text-[10px] text-gray-400">
                        Click để xem chi tiết
                      </div>
                    </div>
                  </button>
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
