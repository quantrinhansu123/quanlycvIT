import type { SubtaskTimeRecord } from "@/types/subtask";

/** Deleted details must not contribute timers or reported work. Keep legacy task-level records. */
export function existingDetailTimeRecords(records: SubtaskTimeRecord[], updates: { id: string }[], initialDeleted = false): SubtaskTimeRecord[] {
  const ids = new Set(updates.map((entry) => entry.id));
  if (!initialDeleted) ids.add("initial");
  return records.filter((record) => !record.detailId || ids.has(record.detailId));
}

export interface TaskTimeSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: "start" | "pause" | "end";
  duration: number;
}

/** Call with records from a single detail. Every start creates a separate session. */
export function taskTimeSessions(records: SubtaskTimeRecord[], now: number): TaskTimeSession[] {
  const sessions: TaskTimeSession[] = [];
  for (const record of records) {
    if (record.type === "start") {
      sessions.push({ id: record.id, startedAt: record.at, status: "start", duration: 0 });
    } else {
      const current = sessions.at(-1);
      if (!current) continue;
      if (!current.endedAt) current.endedAt = record.at;
      current.status = record.type;
    }
  }
  return sessions.map((session) => ({
    ...session,
    duration: Math.max(0, (session.endedAt ? Date.parse(session.endedAt) : now) - Date.parse(session.startedAt)) || 0,
  }));
}

export function formatSessionDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function runningTaskTimeSessions(records: SubtaskTimeRecord[], now: number): TaskTimeSession[] {
  const latestByDetail = new Map<string, SubtaskTimeRecord>();
  for (const record of records) latestByDetail.set(record.detailId ?? "", record);
  return [...latestByDetail.values()]
    .filter((record) => record.type === "start")
    .flatMap((record) => taskTimeSessions([record], now));
}
