"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, List, RefreshCw } from "lucide-react";
import { apiClient } from "@/services/api-client";
import { getAppDateKey } from "@/lib/utils";
import { formatSessionDuration } from "@/lib/task-time-sessions";
import { actualWorkDuration, type DailyWorkRow } from "@/lib/daily-work";
import { DailyWorkChart } from "@/components/tasks/DailyWorkChart";

const VIEW_TABS = [
  { id: "list", label: "Danh sách", icon: List },
  { id: "chart", label: "Biểu đồ", icon: BarChart3 },
] as const;

export default function DailyWorkPage() {
  const [activeTab, setActiveTab] = useState<"list" | "chart">("list");
  const [start, setStart] = useState(() => `${getAppDateKey().slice(0, 7)}-01`);
  const [end, setEnd] = useState(() => getAppDateKey());
  const [employee, setEmployee] = useState("all");
  const [selectedTask, setSelectedTask] = useState("all");
  const [rows, setRows] = useState<DailyWorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (!start || !end || start > end) throw new Error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        const result = await apiClient.get<DailyWorkRow[]>(`/daily-work?${new URLSearchParams({ start, end })}`);
        if (active) setRows(result);
      } catch (reason) {
        if (active) {
          setRows([]);
          setError(reason instanceof Error ? reason.message : "Không tải được danh sách công việc.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [start, end, revision]);

  const employees = useMemo(() => [...new Map(rows.map((row) => [row.employeeId, row.employeeName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi")), [rows]);
  const tasks = useMemo(() => [...new Map(rows.flatMap((row) => row.tasks.map((task) => [task.id, task.title] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi")), [rows]);
  const visible = rows
    .filter((row) => employee === "all" || row.employeeId === employee)
    .map((row) => {
      const matchingTasks = row.tasks.filter((task) => selectedTask === "all" || task.id === selectedTask);
      return { ...row, tasks: matchingTasks, actualDuration: actualWorkDuration(matchingTasks), duration: matchingTasks.reduce((sum, task) => sum + task.duration, 0) };
    })
    .filter((row) => row.tasks.length > 0);
  const total = visible.reduce((sum, row) => sum + row.duration, 0);
  const actualTotal = visible.reduce((sum, row) => sum + row.actualDuration, 0);
  const fieldClass = "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800";

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Danh sách công việc theo ngày</h1>
            <p className="mt-1 text-sm text-gray-500">Tổng hợp thời gian thực làm theo ngày, gán cho người phụ trách Task/chi tiết.</p>
          </div>
          <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">Từ ngày<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className={fieldClass} /></label>
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">Đến ngày<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} className={fieldClass} /></label>
          <label className="flex min-w-48 flex-col gap-1.5 text-sm text-gray-600">Nhân sự
            <select value={employee} onChange={(event) => setEmployee(event.target.value)} className={fieldClass}>
              <option value="all">Tất cả nhân sự</option>
              {employee !== "all" && !employees.some(([id]) => id === employee) && <option value={employee}>Nhân sự đã chọn (không có dữ liệu)</option>}
              {employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="flex min-w-48 max-w-full flex-col gap-1.5 text-sm text-gray-600">Các công việc (Task)
            <select value={selectedTask} onChange={(event) => setSelectedTask(event.target.value)} className={`${fieldClass} w-full sm:max-w-80`}>
              <option value="all">Tất cả công việc</option>
              {selectedTask !== "all" && !tasks.some(([id]) => id === selectedTask) && <option value={selectedTask}>Task đã chọn (không có dữ liệu)</option>}
              {tasks.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right text-sm text-gray-500">Tổng giờ làm (giờ:phút:giây)<p className="mt-1 text-2xl font-semibold tabular-nums text-violet-700">{loading || error ? "—" : formatSessionDuration(total)}</p></div>
        </div>
        <div className="text-right text-sm text-gray-500">Tổng giờ thực tế (giờ:phút:giây)<p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{loading || error ? "—" : formatSessionDuration(actualTotal)}</p></div>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <div role="tablist" aria-label="Chế độ xem công việc" className="flex gap-1 border-b border-gray-200">
          {VIEW_TABS.map((tab, index) => (
            <button
              key={tab.id}
              id={`daily-work-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`daily-work-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowRight") next = (index + 1) % VIEW_TABS.length;
                else if (event.key === "ArrowLeft") next = (index + VIEW_TABS.length - 1) % VIEW_TABS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = VIEW_TABS.length - 1;
                else return;
                event.preventDefault();
                setActiveTab(VIEW_TABS[next].id);
                document.getElementById(`daily-work-tab-${VIEW_TABS[next].id}`)?.focus();
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600 ${activeTab === tab.id ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            >
              <tab.icon className="h-4 w-4" />{tab.label}
            </button>
          ))}
        </div>
        <div id="daily-work-panel-chart" role="tabpanel" aria-labelledby="daily-work-tab-chart" hidden={activeTab !== "chart"} tabIndex={0}>
          <DailyWorkChart rows={visible} start={start} end={end} loading={loading} error={Boolean(error)} />
        </div>
        <div id="daily-work-panel-list" role="tabpanel" aria-labelledby="daily-work-tab-list" hidden={activeTab !== "list"} tabIndex={0} className="overflow-x-auto rounded-xl border border-gray-200 bg-white" aria-busy={loading}>
          <table className="w-full min-w-[1000px] text-left text-sm">
            <caption className="sr-only">Công việc và tổng giờ làm theo ngày, nhân sự</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600"><tr>
              <th scope="col" className="w-32 px-4 py-3">Ngày</th><th scope="col" className="w-52 px-4 py-3">Nhân sự</th><th scope="col" className="px-4 py-3">Các công việc (Task)</th><th scope="col" className="min-w-72 px-4 py-3">Task chi tiết</th><th scope="col" className="w-44 px-4 py-3 text-right">Tổng giờ làm</th>
              <th scope="col" className="w-44 px-4 py-3 text-right">Tổng giờ thực tế</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={6} className="p-10 text-center text-gray-500">Đang tải dữ liệu...</td></tr> : error ? <tr><td colSpan={6} className="p-10 text-center text-gray-500">Không thể tải dữ liệu. Bấm Làm mới để thử lại.</td></tr> : visible.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-gray-500">Chưa có thời gian làm việc được ghi nhận trong bộ lọc này.</td></tr> : visible.map((row) => (
                <tr key={`${row.date}:${row.employeeId}`} className="align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-4 text-gray-600">{row.date.split("-").reverse().join("/")}</td>
                  <td className="px-4 py-4 font-medium text-gray-900">{row.employeeName}</td>
                  <td className="px-4 py-4"><ul className="space-y-2">{row.tasks.map((task) => <li key={task.id} className="flex items-start justify-between gap-4"><Link href={`/quan-ly-cong-viec/danh-sach-task/${task.id}`} className="text-violet-700 hover:underline">{task.title}</Link><span className="shrink-0 tabular-nums text-gray-500">{formatSessionDuration(task.duration)}</span></li>)}</ul></td>
                  <td className="px-4 py-4">
                    <div className="space-y-4">{row.tasks.map((task) => (
                      <div key={task.id}>
                        <p className="mb-1 text-xs font-medium text-gray-500">{task.title}</p>
                        <ul className="space-y-1.5">{task.details.map((detail) => (
                          <li key={detail.id} className="flex items-start justify-between gap-4">
                            <Link
                              href={`/quan-ly-cong-viec/danh-sach-task/${task.id}#detail-${encodeURIComponent(detail.id)}`}
                              className={detail.isRunning ? "font-medium text-emerald-700 hover:underline" : "text-gray-800 hover:text-violet-700 hover:underline"}
                            >
                              {detail.title}
                              {detail.isRunning && <span className="ml-2 inline-flex items-center gap-1 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Đang chạy</span>}
                            </Link>
                            <span className={`shrink-0 tabular-nums ${detail.isRunning ? "text-emerald-700" : "text-gray-500"}`}>{formatSessionDuration(detail.duration)}</span>
                          </li>
                        ))}</ul>
                      </div>
                    ))}</div>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-900">{formatSessionDuration(row.duration)}</td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums text-emerald-700">{formatSessionDuration(row.actualDuration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-5 text-gray-500">Tổng giờ thực tế gộp các khoảng làm việc trùng nhau của từng nhân sự trong ngày; mỗi người được tính toàn bộ khoảng thời gian được gán, không chia đều. Tổng giờ làm cộng thời lượng từng việc, chia đều khi có nhiều người được gán. Giờ làm được tính cho người được gán chi tiết Task (nếu có), không thì theo người phụ trách Task. Không gồm thời gian tạm dừng. Phiên qua nửa đêm được chia theo ngày Việt Nam. Phiên đang chạy được tính đến lúc tải dữ liệu; bấm Làm mới để cập nhật. Chỉ hiển thị các task có thời gian làm việc được ghi nhận.</p>
      </div>
    </div>
  );
}
