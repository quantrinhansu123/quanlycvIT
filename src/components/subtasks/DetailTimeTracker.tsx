"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatSessionDuration, taskTimeSessions } from "@/lib/task-time-sessions";
import type { SubtaskTimeRecord } from "@/types/subtask";

const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "medium",
}).format(new Date(value));

export function DetailTimeTracker({ records, disabled, readOnly = false, onRecord }: {
  records: SubtaskTimeRecord[];
  disabled: boolean;
  readOnly?: boolean;
  onRecord: (type: SubtaskTimeRecord["type"]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const lastType = records.at(-1)?.type;
  useEffect(() => {
    if (lastType !== "start") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lastType]);
  const sessions = taskTimeSessions(records, now);
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-700">Thời gian: {formatSessionDuration(sessions.reduce((sum, session) => sum + session.duration, 0))}</p>
      {!readOnly && <div className="my-2 flex flex-wrap gap-2">
        {lastType !== "start" ? (
          <Button type="button" size="sm" disabled={disabled} onClick={() => onRecord("start")}><Play className="h-3 w-3" />Bắt đầu phiên mới</Button>
        ) : <>
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onRecord("pause")}><Pause className="h-3 w-3" />Tạm dừng</Button>
          <Button type="button" size="sm" variant="danger" disabled={disabled} onClick={() => onRecord("end")}><Square className="h-3 w-3" />Kết thúc</Button>
        </>}
      </div>}
      {sessions.length === 0 ? <p className="mt-2 text-xs text-gray-400">Chưa có phiên tính giờ.</p> : (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[440px] text-left text-xs">
            <caption className="sr-only">Các phiên tính giờ của chi tiết Task</caption>
            <thead className="sticky top-0 bg-gray-50 text-gray-500">
              <tr>
                <th scope="col" className="px-2 py-2">Phiên</th>
                <th scope="col" className="px-2 py-2">Bắt đầu</th>
                <th scope="col" className="px-2 py-2">Dừng lúc</th>
                <th scope="col" className="px-2 py-2">Thời lượng</th>
                <th scope="col" className="px-2 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session, index) => (
                <tr key={session.id}>
                  <th scope="row" className="px-2 py-2 font-semibold">{index + 1}</th>
                  <td className="px-2 py-2"><time dateTime={session.startedAt}>{formatDate(session.startedAt)}</time></td>
                  <td className="px-2 py-2">{session.endedAt ? <time dateTime={session.endedAt}>{formatDate(session.endedAt)}</time> : "—"}</td>
                  <td className="px-2 py-2 font-semibold tabular-nums">{formatSessionDuration(session.duration)}</td>
                  <td className="px-2 py-2">{session.status === "start" ? "Đang tính giờ" : session.status === "pause" ? "Tạm dừng" : "Kết thúc"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
