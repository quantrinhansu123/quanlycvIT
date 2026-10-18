"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { DailyWorkRow } from "@/lib/daily-work";
import { formatSessionDuration } from "@/lib/task-time-sessions";

type GroupBy = "date" | "employee" | "task";
const MODES: { value: GroupBy; label: string }[] = [
  { value: "date", label: "Theo ngày" },
  { value: "employee", label: "Theo nhân sự" },
  { value: "task", label: "Theo Task" },
];

export function DailyWorkChart({ rows, start, end, loading, error }: {
  rows: DailyWorkRow[];
  start: string;
  end: string;
  loading: boolean;
  error: boolean;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const bars = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; duration: number }>();
    const add = (id: string, label: string, duration: number) => {
      const current = groups.get(id);
      if (current) current.duration += duration;
      else groups.set(id, { id, label, duration });
    };
    if (groupBy === "date") {
      const first = Date.parse(`${start}T00:00:00Z`);
      const last = Date.parse(`${end}T00:00:00Z`);
      if (Number.isFinite(first) && Number.isFinite(last) && last - first <= 365 * 86_400_000) {
        for (let day = first; day <= last; day += 86_400_000) {
          const date = new Date(day).toISOString().slice(0, 10);
          add(date, date.split("-").reverse().join("/"), 0);
        }
      }
    }
    for (const row of rows) {
      if (groupBy === "date") add(row.date, row.date.split("-").reverse().join("/"), row.duration);
      else if (groupBy === "employee") add(row.employeeId, row.employeeName, row.duration);
      else for (const task of row.tasks) add(task.id, task.title, task.duration);
    }
    return [...groups.values()].sort((a, b) => groupBy === "date" ? a.id.localeCompare(b.id) : b.duration - a.duration || a.label.localeCompare(b.label, "vi"));
  }, [rows, start, end, groupBy]);
  const maxHours = Math.max(1, Math.ceil(Math.max(0, ...bars.map((bar) => bar.duration)) / 3_600_000));

  return (
    <section aria-label="Biểu đồ tổng giờ làm" aria-busy={loading} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-gray-900"><BarChart3 className="h-5 w-5 text-violet-600" />Biểu đồ tổng giờ làm</h2>
          <p className="mt-1 text-xs text-gray-500">Áp dụng các bộ lọc phía trên. Thời lượng hiển thị theo giờ:phút:giây.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label="Nhóm biểu đồ">
          {MODES.map((mode) => <button key={mode.value} type="button" aria-pressed={groupBy === mode.value} onClick={() => setGroupBy(mode.value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${groupBy === mode.value ? "bg-white text-violet-700 shadow-sm" : "text-gray-600 hover:bg-white/70"}`}>{mode.label}</button>)}
        </div>
      </div>
      {loading ? <p role="status" className="py-12 text-center text-sm text-gray-500">Đang tải biểu đồ...</p>
        : error ? <p className="py-12 text-center text-sm text-gray-500">Không thể tải dữ liệu biểu đồ.</p>
        : rows.length === 0 ? <p className="py-12 text-center text-sm text-gray-500">Chưa có thời gian làm việc trong bộ lọc này.</p>
        : <>
          <div className="mb-2 grid grid-cols-[minmax(80px,1fr)_minmax(100px,3fr)_72px] gap-3 text-xs text-gray-400 sm:grid-cols-[minmax(120px,1fr)_minmax(100px,3fr)_80px]" aria-hidden="true">
            <span>{MODES.find((mode) => mode.value === groupBy)?.label}</span>
            <div className="flex justify-between"><span>0</span><span>{(maxHours / 2).toLocaleString("vi-VN")} giờ</span><span>{maxHours.toLocaleString("vi-VN")} giờ</span></div>
            <span className="text-right">Thời lượng</span>
          </div>
          <div className="max-h-96 overflow-y-auto" tabIndex={0} role="region" aria-label="Các thanh biểu đồ, cuộn để xem thêm">
            <ul className="space-y-2 py-1">
              {bars.map((bar) => <li key={bar.id} className="grid grid-cols-[minmax(80px,1fr)_minmax(100px,3fr)_72px] items-center gap-3 sm:grid-cols-[minmax(120px,1fr)_minmax(100px,3fr)_80px]">
                <span className="break-words text-xs text-gray-600">{bar.label}</span>
                <div className="h-7 overflow-hidden rounded bg-gray-50" aria-hidden="true">
                  <div className="h-full rounded bg-violet-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${bar.duration / (maxHours * 3_600_000) * 100}%` }} />
                </div>
                <span className="text-right text-xs font-medium tabular-nums text-gray-700">{formatSessionDuration(bar.duration)}</span>
              </li>)}
            </ul>
          </div>
        </>}
    </section>
  );
}
