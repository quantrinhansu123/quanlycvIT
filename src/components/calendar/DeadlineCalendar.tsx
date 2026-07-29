"use client";

import { useMemo } from "react";
import {
  buildCalendarGrid,
  getWeeks,
  rangeOverlapsWeek,
  getBarPosition,
  WEEKDAY_LABELS,
  type CalendarDay,
} from "@/lib/calendar-utils";
import { formatSpan } from "@/lib/utils";
import type { WorkTask } from "@/types/task";
import type { Project } from "@/types/project";
import { PROJECT_COLORS } from "@/types/project";
import { Avatar } from "@/components/ui/Avatar";
import type { ProjectMember } from "@/types/project";

interface CalendarTaskBar {
  task: WorkTask;
  project?: Project;
  assignee?: ProjectMember;
}

interface DeadlineCalendarProps {
  year: number;
  month: number; // 0-indexed
  tasks: WorkTask[];
  projectsById: Map<string, Project>;
  membersById: Map<string, ProjectMember>;
  /** Callback khi click vào một thanh task trên lịch. */
  onTaskClick?: (task: WorkTask) => void;
}

/** Get a Tailwind-compatible bg color for a project. */
function getProjectBgClass(color?: string): string {
  switch (color) {
    case "purple":
      return "bg-violet-500";
    case "green":
      return "bg-emerald-500";
    case "orange":
      return "bg-amber-500";
    case "red":
      return "bg-rose-500";
    case "blue":
      return "bg-sky-500";
    default:
      return "bg-gray-500";
  }
}

function getProjectHoverClass(color?: string): string {
  switch (color) {
    case "purple":
      return "hover:bg-violet-600";
    case "green":
      return "hover:bg-emerald-600";
    case "orange":
      return "hover:bg-amber-600";
    case "red":
      return "hover:bg-rose-600";
    case "blue":
      return "hover:bg-sky-600";
    default:
      return "hover:bg-gray-600";
  }
}

function getProjectHex(color?: string): string {
  const match = PROJECT_COLORS.find((c) => c.value === color);
  return match?.hex ?? "#6B7280";
}

/**
 * Allocate task bars to "lanes" within each week so they don't overlap vertically.
 * Returns a Map from weekIndex to an array of { lane, bar }.
 */
function allocateLanes(
  weeks: CalendarDay[][],
  bars: CalendarTaskBar[]
): Map<number, { lane: number; bar: CalendarTaskBar; startCol: number; span: number }[]> {
  const result = new Map<
    number,
    { lane: number; bar: CalendarTaskBar; startCol: number; span: number }[]
  >();

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekStart = week[0].dateStr;
    const weekEnd = week[6].dateStr;

    // Find bars that overlap this week
    const overlapping = bars.filter((b) =>
      rangeOverlapsWeek(b.task.startDate, b.task.dueDate, weekStart, weekEnd)
    );

    // Sort by start date, then by longer span first so they get stable lanes
    overlapping.sort((a, b) => {
      if (a.task.startDate !== b.task.startDate)
        return a.task.startDate < b.task.startDate ? -1 : 1;
      // Longer tasks get earlier lanes
      const spanA =
        new Date(a.task.dueDate).getTime() - new Date(a.task.startDate).getTime();
      const spanB =
        new Date(b.task.dueDate).getTime() - new Date(b.task.startDate).getTime();
      return spanB - spanA;
    });

    // Greedy lane allocation
    const lanes: { endCol: number }[] = []; // track rightmost column used in each lane
    const allocated: { lane: number; bar: CalendarTaskBar; startCol: number; span: number }[] = [];

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

    result.set(wi, allocated);
  }

  return result;
}

const MAX_VISIBLE_LANES = 3;

export function DeadlineCalendar({
  year,
  month,
  tasks,
  projectsById,
  membersById,
  onTaskClick,
}: DeadlineCalendarProps) {
  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);
  const weeks = useMemo(() => getWeeks(grid), [grid]);

  const bars: CalendarTaskBar[] = useMemo(
    () =>
      tasks.map((task) => ({
        task,
        project: projectsById.get(task.projectId),
        assignee: membersById.get(task.assigneeId),
      })),
    [tasks, projectsById, membersById]
  );

  const weekLanes = useMemo(() => allocateLanes(weeks, bars), [weeks, bars]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-3 text-center text-xs font-semibold tracking-wide ${
              i === 0 || i === 6 ? "text-rose-400" : "text-gray-500"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar body */}
      {weeks.map((week, wi) => {
        const lanes = weekLanes.get(wi) ?? [];
        const maxLane = lanes.reduce((max, l) => Math.max(max, l.lane), -1);
        const totalLanes = maxLane + 1;
        const visibleLanes = Math.min(totalLanes, MAX_VISIBLE_LANES);
        const hiddenCount = totalLanes - visibleLanes;

        return (
          <div key={wi} className="border-b border-gray-50 last:border-b-0">
            {/* Date numbers row */}
            <div className="grid grid-cols-7">
              {week.map((day) => (
                <div
                  key={day.dateStr}
                  className={`border-r border-gray-50 px-2 pb-0.5 pt-2 text-right text-sm last:border-r-0 ${
                    day.isToday
                      ? "bg-blue-50/60"
                      : !day.isCurrentMonth
                        ? "bg-gray-50/40"
                        : ""
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                      day.isToday
                        ? "bg-blue-600 font-bold text-white"
                        : !day.isCurrentMonth
                          ? "text-gray-300"
                          : "text-gray-700"
                    }`}
                  >
                    {day.day}
                  </span>
                </div>
              ))}
            </div>

            {/* Task bars area */}
            <div className="relative" style={{ minHeight: visibleLanes > 0 ? `${visibleLanes * 28 + 8}px` : "20px" }}>
              {/* Background columns to show cell borders */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
                {week.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`border-r border-gray-50 last:border-r-0 ${
                      day.isToday
                        ? "bg-blue-50/60"
                        : !day.isCurrentMonth
                          ? "bg-gray-50/40"
                          : ""
                    }`}
                  />
                ))}
              </div>

              {/* Render bars */}
              {lanes
                .filter((l) => l.lane < MAX_VISIBLE_LANES)
                .map(({ lane, bar, startCol, span }) => {
                  const weekStart = week[0].dateStr;
                  const weekEnd = week[6].dateStr;
                  const isStartClipped = bar.task.startDate < weekStart;
                  const isEndClipped = bar.task.dueDate > weekEnd;
                  const spanLabel = formatSpan(bar.task.startDate, bar.task.dueDate);
                  const projectCode = bar.project?.code ?? "";
                  const projectColor = bar.project?.color;
                  const bgClass = getProjectBgClass(projectColor);
                  const hoverClass = getProjectHoverClass(projectColor);
                  const hexColor = getProjectHex(projectColor);

                  const leftPercent = (startCol / 7) * 100;
                  const widthPercent = (span / 7) * 100;

                  return (
                    <div
                      key={`${bar.task.id}-w${wi}`}
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

                        {/* Show avatar on the due-date end */}
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

                        {/* Tooltip on hover */}
                        <div
                          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                          style={{ minWidth: "220px" }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: hexColor }}
                            />
                            <span className="font-semibold text-gray-900 text-left">
                              [{projectCode}] {bar.task.title}
                            </span>
                          </div>
                          <div className="text-gray-500 text-left">
                            Thời gian: {spanLabel}
                          </div>
                          {bar.assignee && (
                            <div className="text-gray-500 mt-0.5 text-left">
                              Phụ trách: {bar.assignee.name}
                            </div>
                          )}
                          <div className="text-gray-400 mt-1 text-left text-[10px]">
                            Click để xem chi tiết
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}

              {/* Show "+N more" indicator if tasks overflow */}
              {hiddenCount > 0 && (
                <div
                  className="absolute right-2 text-[10px] font-medium text-gray-400"
                  style={{ top: `${visibleLanes * 28 + 4}px` }}
                >
                  +{hiddenCount} khác
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
