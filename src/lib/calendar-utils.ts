/**
 * Calendar date-math helpers used exclusively by the deadline-calendar feature.
 * All month values follow JavaScript convention: 0-indexed (0 = January, 11 = December).
 */

/** Names of days used for the calendar header. */
export const WEEKDAY_LABELS = ["CN", "THỨ 2", "THỨ 3", "THỨ 4", "THỨ 5", "THỨ 6", "THỨ 7"] as const;

/** Full Vietnamese month names (1-indexed access: MONTH_NAMES[1] = "tháng 1"). */
export const MONTH_NAMES = [
  "",
  "tháng 1",
  "tháng 2",
  "tháng 3",
  "tháng 4",
  "tháng 5",
  "tháng 6",
  "tháng 7",
  "tháng 8",
  "tháng 9",
  "tháng 10",
  "tháng 11",
  "tháng 12",
] as const;

export interface CalendarDay {
  /** Full date string in YYYY-MM-DD format. */
  dateStr: string;
  /** Day-of-month number (1–31). */
  day: number;
  /** Whether this day belongs to the currently displayed month. */
  isCurrentMonth: boolean;
  /** Whether this date is today. */
  isToday: boolean;
}

/** Return ISO-formatted YYYY-MM-DD for a Date. */
export function toISODateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build the 6-row × 7-column grid of CalendarDay objects for a given month.
 * The grid always starts on Sunday.
 */
export function buildCalendarGrid(year: number, month: number): CalendarDay[] {
  const todayStr = toISODateStr(new Date());

  // First day of the month
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun

  // We need to go back to the previous Sunday
  const gridStart = new Date(year, month, 1 - startDayOfWeek);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = toISODateStr(d);
    days.push({
      dateStr,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month && d.getFullYear() === year,
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

/** Get list of weeks (each a CalendarDay[7]) from a flat grid. */
export function getWeeks(grid: CalendarDay[]): CalendarDay[][] {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }
  return weeks;
}

/** Check if two YYYY-MM-DD strings represent the same date. */
export function isSameDate(a: string, b: string): boolean {
  return a === b;
}

/**
 * Check whether a date range [startDate, endDate] overlaps with a week range [weekStart, weekEnd].
 * All params are YYYY-MM-DD strings.
 */
export function rangeOverlapsWeek(
  startDate: string,
  endDate: string,
  weekStart: string,
  weekEnd: string
): boolean {
  return startDate <= weekEnd && endDate >= weekStart;
}

/**
 * Compute visual positioning of a task bar within a week.
 * Returns { startCol, span } where startCol is 0-indexed day within the week
 * and span is the number of day-columns the bar covers.
 */
export function getBarPosition(
  taskStart: string,
  taskEnd: string,
  weekStart: string,
  weekEnd: string
): { startCol: number; span: number } {
  const clampedStart = taskStart < weekStart ? weekStart : taskStart;
  const clampedEnd = taskEnd > weekEnd ? weekEnd : taskEnd;

  const weekStartDate = new Date(weekStart);
  const clampedStartDate = new Date(clampedStart);
  const clampedEndDate = new Date(clampedEnd);

  const startCol = Math.round(
    (clampedStartDate.getTime() - weekStartDate.getTime()) / 86_400_000
  );
  const span =
    Math.round(
      (clampedEndDate.getTime() - clampedStartDate.getTime()) / 86_400_000
    ) + 1;

  return { startCol, span };
}

/** Short Vietnamese month names (1-indexed: SHORT_MONTH_NAMES[1] = "thg 1"). */
export const SHORT_MONTH_NAMES = [
  "",
  "thg 1",
  "thg 2",
  "thg 3",
  "thg 4",
  "thg 5",
  "thg 6",
  "thg 7",
  "thg 8",
  "thg 9",
  "thg 10",
  "thg 11",
  "thg 12",
] as const;

/** Vietnamese weekday labels with date format for week view header. */
export const WEEKDAY_FULL_LABELS = [
  "CN",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
] as const;

/**
 * Get the start (Sunday) and end (Saturday) of the week containing the given date.
 */
export function getWeekRange(date: Date): { weekStart: Date; weekEnd: Date } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { weekStart, weekEnd };
}

/**
 * Build an array of 7 CalendarDay objects for the week starting at weekStart.
 */
export function getWeekDays(weekStart: Date): CalendarDay[] {
  const todayStr = toISODateStr(new Date());
  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = toISODateStr(d);
    days.push({
      dateStr,
      day: d.getDate(),
      isCurrentMonth: true, // Always true in week view context
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

/**
 * Format the week header title, e.g. "26 thg 7 – 1 thg 8, 2026".
 */
export function formatWeekHeader(weekStart: Date, weekEnd: Date): string {
  const startDay = weekStart.getDate();
  const startMonth = weekStart.getMonth() + 1;
  const endDay = weekEnd.getDate();
  const endMonth = weekEnd.getMonth() + 1;
  const endYear = weekEnd.getFullYear();

  if (startMonth === endMonth) {
    return `${startDay} – ${endDay} ${SHORT_MONTH_NAMES[endMonth]}, ${endYear}`;
  }
  return `${startDay} ${SHORT_MONTH_NAMES[startMonth]} – ${endDay} ${SHORT_MONTH_NAMES[endMonth]}, ${endYear}`;
}
