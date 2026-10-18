import type { SubtaskTimeRecord } from "@/types/subtask";
import { taskTimeSessions } from "@/lib/task-time-sessions";

export interface DailyWorkTask {
  id: string;
  title: string;
  records: SubtaskTimeRecord[];
  /** Task-level assignees from task_phu_trach (primary first). */
  assigneeIds?: string[];
  /** Detail-level assignees from handover rows, keyed by detailId. */
  detailAssignees?: Record<string, string[]>;
  detailTitles?: Record<string, string>;
}

export interface DailyWorkRow {
  date: string;
  employeeId: string;
  employeeName: string;
  tasks: { id: string; title: string; duration: number; details: { id: string; title: string; duration: number }[] }[];
  duration: number;
}

const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;

function assigneesForDetail(task: DailyWorkTask, detailId: string): string[] {
  const detail = task.detailAssignees?.[detailId]?.filter(Boolean) ?? [];
  if (detail.length > 0) return [...new Set(detail)];
  return [...new Set((task.assigneeIds ?? []).filter(Boolean))];
}

function addDuration(
  rows: Map<string, DailyWorkRow>,
  names: Record<string, string>,
  task: DailyWorkTask,
  detailId: string,
  date: string,
  employeeId: string,
  duration: number,
) {
  if (duration <= 0) return;
  const key = `${date}:${employeeId}`;
  let row = rows.get(key);
  if (!row) {
    row = { date, employeeId, employeeName: names[employeeId] || "Chưa xác định nhân sự", tasks: [], duration: 0 };
    rows.set(key, row);
  }
  let item = row.tasks.find((entry) => entry.id === task.id);
  if (!item) {
    item = { id: task.id, title: task.title, duration: 0, details: [] };
    row.tasks.push(item);
  }
  item.duration += duration;
  let detail = item.details.find((entry) => entry.id === detailId);
  if (!detail) {
    detail = {
      id: detailId,
      title: task.detailTitles?.[detailId] || (detailId === "initial" ? "Chi tiết ban đầu" : "Chi tiết không còn thông tin"),
      duration: 0,
    };
    item.details.push(detail);
  }
  detail.duration += duration;
  row.duration += duration;
}

/** Attribute each session to detail/task assignees; split at midnight in Vietnam. */
export function dailyWorkRows(tasks: DailyWorkTask[], startDate: string, endDate: string, names: Record<string, string>, now: number): DailyWorkRow[] {
  const from = Date.parse(`${startDate}T00:00:00+07:00`);
  const until = Date.parse(`${endDate}T00:00:00+07:00`) + DAY;
  const rows = new Map<string, DailyWorkRow>();
  for (const task of tasks) {
    const details = new Map<string, SubtaskTimeRecord[]>();
    for (const record of task.records) {
      if (!Number.isFinite(Date.parse(record.at))) continue;
      const key = record.detailId || "initial";
      const records = details.get(key) ?? [];
      records.push(record);
      details.set(key, records);
    }
    for (const [detailId, records] of details) {
      records.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const employees = assigneesForDetail(task, detailId);
      const targets = employees.length > 0 ? employees : [""];
      for (const session of taskTimeSessions(records, now)) {
        const started = Date.parse(session.startedAt);
        const end = Math.min(started + session.duration, until, now);
        let cursor = Math.max(started, from);
        while (cursor < end) {
          const date = new Date(cursor + VN_OFFSET).toISOString().slice(0, 10);
          const next = Math.min(Date.parse(`${date}T00:00:00+07:00`) + DAY, end);
          const slice = next - cursor;
          const share = slice / targets.length;
          for (const employeeId of targets) {
            addDuration(rows, names, task, detailId, date, employeeId, share);
          }
          cursor = next;
        }
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName, "vi"));
}
