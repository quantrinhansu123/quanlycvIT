"use client";

import { useEffect, useState } from "react";
import { Clock3, Pause, Play, Plus, Square } from "lucide-react";
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
  onRecord: (type: SubtaskTimeRecord["type"] | "manual", startedAt?: string, endedAt?: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
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
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => setManualOpen((open) => !open)}><Plus className="h-3 w-3" />Thêm giờ thủ công</Button>
        {lastType !== "start" ? (
          <Button type="button" size="sm" disabled={disabled} onClick={() => onRecord("start")}><Play className="h-3 w-3" />Bắt đầu phiên mới</Button>
        ) : <>
          <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onRecord("pause")}><Pause className="h-3 w-3" />Tạm dừng</Button>
          <Button type="button" size="sm" variant="danger" disabled={disabled} onClick={() => onRecord("end")}><Square className="h-3 w-3" />Kết thúc</Button>
        </>}
      </div>}
      {!readOnly && manualOpen && <form className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={(event) => { event.preventDefault(); if (!manualStart || !manualEnd) return; onRecord("manual", new Date(manualStart).toISOString(), new Date(manualEnd).toISOString()); setManualOpen(false); setManualStart(""); setManualEnd(""); }}>
        <label className="grid gap-1 text-xs font-medium text-gray-600">Giờ bắt đầu<input required type="datetime-local" value={manualStart} onChange={(event) => setManualStart(event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium text-gray-600">Giờ kết thúc<input required type="datetime-local" value={manualEnd} onChange={(event) => setManualEnd(event.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm" /></label>
        <Button type="submit" size="sm" disabled={disabled || !manualStart || !manualEnd || new Date(manualEnd) <= new Date(manualStart)}><Clock3 className="h-3 w-3" />Lưu giờ</Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setManualOpen(false)}>Hủy</Button>
        {manualStart && manualEnd && new Date(manualEnd) <= new Date(manualStart) && <p className="w-full text-xs text-red-600">Giờ kết thúc phải sau giờ bắt đầu.</p>}
      </form>}
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
