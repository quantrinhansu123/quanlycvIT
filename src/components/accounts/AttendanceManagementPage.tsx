"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, LogOut, Pencil, Plus, Search, Trash2, UsersRound, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { SearchableMultiSelect } from "@/components/ui/SearchableMultiSelect";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { getErrorMessage } from "@/lib/errors";
import { INITIAL_HANDOVER_SOURCE_ID } from "@/lib/handover";
import { accountService } from "@/services/account-service";
import { projectService } from "@/services/project-service";
import { subtaskService } from "@/services/subtask-service";
import { taskService } from "@/services/task-service";
import type { EmployeeAccount, EmployeeAttendance } from "@/types/account";
import type { Subtask } from "@/types/subtask";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const displayDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
};
const currentTime = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};
const isOvernight = (record: EmployeeAttendance) => {
  if (!record.checkIn || !record.checkOut) return false;
  return record.checkOut < record.checkIn;
};
const workMinutes = (record: EmployeeAttendance) => {
  if (!record.checkIn || !record.checkOut) return null;
  const [inHour, inMinute] = record.checkIn.split(":").map(Number);
  const [outHour, outMinute] = record.checkOut.split(":").map(Number);
  let minutes = outHour * 60 + outMinute - (inHour * 60 + inMinute);
  // Ca qua đêm: check-out sang sáng hôm sau thì cộng 24h.
  if (minutes < 0) minutes += 24 * 60;
  return minutes >= 0 ? minutes : null;
};
const formatWorkDuration = (minutes: number | null) => {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
};

interface TaskDetailItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  index: number;
}

interface AttendanceTask {
  id: string;
  title: string;
  workTaskId: string;
  details: TaskDetailItem[];
}

interface WorkItem {
  taskId: string;
  detailId?: string;
  detailTitle?: string;
  description: string;
}

function taskDetailName(description?: string): string {
  return description?.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    ?.replace(/^#{1,6}\s+/, "").slice(0, 120) || "Chi tiết chưa có tên";
}

/** Các dòng "Chi tiết Task" giống màn hình chi tiết task: lần đầu + các lần bổ sung. */
function buildTaskDetails(subtask: Subtask): TaskDetailItem[] {
  const initialTitle = subtask.handover?.titles?.[INITIAL_HANDOVER_SOURCE_ID]?.trim() ?? "";
  const hasInitial = !subtask.handover?.initialDeleted && Boolean(initialTitle || subtask.description?.trim());
  const entries = [
    ...(hasInitial
      ? [{ id: INITIAL_HANDOVER_SOURCE_ID, description: subtask.description, createdAt: subtask.createdAt }]
      : []),
    ...subtask.updates,
  ];
  return entries.map((entry, index) => ({
    id: entry.id,
    title: subtask.handover?.titles?.[entry.id] ?? taskDetailName(entry.description),
    description: entry.description ?? "",
    createdAt: entry.createdAt ?? "",
    index: index + 1,
  }));
}

function parseWorkItems(workDetail: string | undefined): WorkItem[] {
  if (!workDetail) return [];
  try {
    const parsed = JSON.parse(workDetail);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          taskId: typeof row.taskId === "string" ? row.taskId : "",
          detailId: typeof row.detailId === "string" ? row.detailId : "",
          detailTitle: typeof row.detailTitle === "string" ? row.detailTitle : "",
          description: typeof row.description === "string" ? row.description : "",
        };
      });
    }
  } catch {}
  // Fallback for old format (plain text)
  return workDetail ? [{ taskId: "", description: workDetail }] : [];
}

function StatCard({
  label,
  icon: Icon,
  iconClassName,
  children,
}: {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative min-h-28 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <div className="mt-2 pr-12">{children}</div>
      <span
        className={`absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full ${iconClassName}`}
      >
        <Icon className="h-4 w-4" />
      </span>
    </article>
  );
}

export function AttendanceManagementPage() {
  const { notify, confirm } = useFeedback();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [records, setRecords] = useState<EmployeeAttendance[]>([]);
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [tasks, setTasks] = useState<AttendanceTask[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [workTasks, setWorkTasks] = useState<{ id: string; title: string; projectId: string }[]>([]);
  const [filterProjectIds, setFilterProjectIds] = useState<string[]>([]);
  const [filterWorkTaskIds, setFilterWorkTaskIds] = useState<string[]>([]);
  const [formTaskIds, setFormTaskIds] = useState<string[]>([]);
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmployeeAttendance | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickTime, setQuickTime] = useState("");
  const [search, setSearch] = useState("");
  const [workItems, setWorkItems] = useState<WorkItem[]>([{ taskId: "", description: "" }]);

  const startDate = dateKey(month);
  const endDate = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await accountService.getAttendanceForPeriod(startDate, endDate));
    } catch (error) {
      notify({ type: "error", title: "Không thể tải dữ liệu chấm công", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setLoading(false);
    }
  }, [endDate, notify, startDate]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    accountService.getAnalytics()
      .then((directory) => setEmployees(directory.accounts.filter((account) => account.status === "active")))
      .catch((error: unknown) => notify({ type: "error", title: "Không thể tải danh sách nhân viên", description: getErrorMessage(error, "Vui lòng thử lại.") }));
    subtaskService.getSubtasks()
      .then((items) => setTasks(items.map((item) => ({ id: item.id, title: item.title, workTaskId: item.workTaskId, details: buildTaskDetails(item) }))))
      .catch((error: unknown) => notify({ type: "error", title: "Không thể tải danh sách task", description: getErrorMessage(error, "Vui lòng thử lại.") }));
    projectService.getProjectDirectory()
      .then((items) => setProjects(items.map((item) => ({ id: item.id, name: item.name }))))
      .catch((error: unknown) => notify({ type: "error", title: "Không thể tải danh sách dự án", description: getErrorMessage(error, "Vui lòng thử lại.") }));
    taskService.getTaskDirectory()
      .then((items) => setWorkTasks(items.map((item) => ({ id: item.id, title: item.title, projectId: item.projectId }))))
      .catch((error: unknown) => notify({ type: "error", title: "Không thể tải danh sách công việc", description: getErrorMessage(error, "Vui lòng thử lại.") }));
  }, [notify]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    if (!query) return records;
    return records.filter((record) => {
      const taskTitles = (record.taskIds ?? []).map((taskId) => tasks.find((task) => task.id === taskId)?.title ?? "").join(" ");
      return `${record.employeeName} ${record.employeeCode} ${record.taskTitle ?? ""} ${taskTitles} ${record.workDetail ?? ""}`.toLocaleLowerCase("vi").includes(query);
    });
  }, [records, search, tasks]);

  function openNewForm() {
    setEditingRecord(null);
    setCheckIn("");
    setCheckOut("");
    setFormEmployeeId("");
    setFilterProjectIds([]);
    setFilterWorkTaskIds([]);
    setFormTaskIds([]);
    setWorkItems([{ taskId: "", description: "" }]);
    setShowForm(true);
  }

  function openEditForm(record: EmployeeAttendance) {
    setEditingRecord(record);
    setFormEmployeeId(record.employeeId);
    setCheckIn(record.checkIn ?? "");
    setCheckOut(record.checkOut ?? "");
    // Dựng lại bộ lọc Dự án → Công việc từ các task đã gắn (nếu còn tồn tại).
    const recordTaskIds = record.taskIds?.length ? record.taskIds : record.taskId ? [record.taskId] : [];
    const workTaskIds = Array.from(new Set(recordTaskIds
      .map((taskId) => tasks.find((item) => item.id === taskId)?.workTaskId)
      .filter((value): value is string => Boolean(value))));
    const projectIds = Array.from(new Set(workTaskIds
      .map((workTaskId) => workTasks.find((item) => item.id === workTaskId)?.projectId)
      .filter((value): value is string => Boolean(value))));
    setFilterProjectIds(projectIds);
    setFilterWorkTaskIds(workTaskIds);
    setFormTaskIds(recordTaskIds);
    // Parse workDetail JSON nếu có, ngược lại dùng text cũ làm item đầu tiên.
    try {
      const parsed = JSON.parse(record.workDetail ?? "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        setWorkItems(parsed.map((item) => {
          const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return {
            taskId: typeof row.taskId === "string" ? row.taskId : "",
            detailId: typeof row.detailId === "string" ? row.detailId : "",
            detailTitle: typeof row.detailTitle === "string" ? row.detailTitle : "",
            description: typeof row.description === "string" ? row.description : "",
          };
        }));
      } else if (record.workDetail) {
        setWorkItems([{ taskId: record.taskId ?? "", description: record.workDetail }]);
      } else {
        setWorkItems([{ taskId: "", description: "" }]);
      }
    } catch {
      if (record.workDetail) {
        setWorkItems([{ taskId: record.taskId ?? "", description: record.workDetail }]);
      } else {
        setWorkItems([{ taskId: "", description: "" }]);
      }
    }
    setShowForm(true);
  }

  function taskVisible(task: { id: string; workTaskId: string }, projectIds: string[], workTaskIds: string[]) {
    if (workTaskIds.length) return workTaskIds.includes(task.workTaskId);
    if (projectIds.length) {
      const owner = workTasks.find((item) => item.id === task.workTaskId);
      return Boolean(owner && projectIds.includes(owner.projectId));
    }
    return true;
  }

  function handleFilterProjectChange(projectIds: string[]) {
    setFilterProjectIds(projectIds);
    // Công việc không còn thuộc dự án đã chọn thì bỏ khỏi bộ lọc.
    const nextWorkTaskIds = filterWorkTaskIds.filter((workTaskId) => {
      const owner = workTasks.find((item) => item.id === workTaskId);
      return Boolean(owner && (!projectIds.length || projectIds.includes(owner.projectId)));
    });
    setFilterWorkTaskIds(nextWorkTaskIds);
    // Task đang chọn không còn thuộc phạm vi lọc thì bỏ chọn.
    setFormTaskIds((current) => current.filter((taskId) => {
      const task = tasks.find((item) => item.id === taskId);
      return Boolean(task && taskVisible(task, projectIds, nextWorkTaskIds));
    }));
    setWorkItems((current) => current.map((item) => {
      if (!item.taskId) return item;
      const task = tasks.find((entry) => entry.id === item.taskId);
      return task && taskVisible(task, projectIds, nextWorkTaskIds) ? item : { ...item, taskId: "", detailId: "", detailTitle: "" };
    }));
  }

  function handleFilterWorkTaskChange(workTaskIds: string[]) {
    setFilterWorkTaskIds(workTaskIds);
    setFormTaskIds((current) => current.filter((taskId) => {
      const task = tasks.find((item) => item.id === taskId);
      return Boolean(task && taskVisible(task, filterProjectIds, workTaskIds));
    }));
    setWorkItems((current) => current.map((item) => {
      if (!item.taskId) return item;
      const task = tasks.find((entry) => entry.id === item.taskId);
      return task && taskVisible(task, filterProjectIds, workTaskIds) ? item : { ...item, taskId: "", detailId: "", detailTitle: "" };
    }));
  }

  function handleWorkItemTaskChange(index: number, taskId: string) {
    setWorkItems((current) => current.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        taskId,
        detailId: "",
        detailTitle: "",
        description: item.description === item.detailTitle ? "" : item.description,
      };
    }));
  }

  function handleWorkItemDetailChange(index: number, detailId: string) {
    setWorkItems((current) => current.map((item, i) => {
      if (i !== index) return item;
      if (!detailId) {
        return {
          ...item,
          detailId: "",
          detailTitle: "",
          description: item.description === item.detailTitle ? "" : item.description,
        };
      }
      const task = tasks.find((entry) => entry.id === item.taskId);
      const detail = task?.details.find((entry) => entry.id === detailId);
      return {
        ...item,
        detailId,
        detailTitle: detail?.title ?? "",
        description: detail?.title ?? item.description,
      };
    }));
  }

  const filteredWorkTasks = filterProjectIds.length
    ? workTasks.filter((item) => filterProjectIds.includes(item.projectId))
    : workTasks;
  const filteredTasks = tasks.filter((item) => taskVisible(item, filterProjectIds, filterWorkTaskIds));

  function openQuickCheckOut(record: EmployeeAttendance) {
    // Gợi ý sẵn giờ hiện tại, người dùng có thể chỉnh lại trước khi lưu.
    if (quickEditId === record.id) {
      setQuickEditId(null);
      return;
    }
    setQuickEditId(record.id);
    setQuickTime(currentTime());
  }

  async function confirmQuickCheckOut(record: EmployeeAttendance) {
    if (!quickTime) {
      notify({ type: "error", title: "Vui lòng chọn giờ check-out" });
      return;
    }
    setCheckingOutId(record.id);
    try {
      await accountService.saveAttendance({
        employeeId: record.employeeId,
        date: record.date,
        checkIn: record.checkIn ?? "",
        checkOut: quickTime,
        taskId: record.taskId ?? "",
        taskIds: record.taskIds?.length ? record.taskIds : record.taskId ? [record.taskId] : [],
        workDetail: record.workDetail ?? "",
      });
      const overnightNote = record.checkIn && quickTime < record.checkIn ? " (ca qua đêm)" : "";
      notify({ type: "success", title: `Đã check-out ${record.employeeName} lúc ${quickTime}${overnightNote}` });
      setQuickEditId(null);
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể check-out", description: getErrorMessage(error, "Vui lòng kiểm tra thông tin và thử lại.") });
    } finally {
      setCheckingOutId(null);
    }
  }

  async function removeRecord(record: EmployeeAttendance) {
    const confirmed = await confirm({
      title: "Xóa bản ghi chấm công",
      description: `Bạn có chắc muốn xóa chấm công ngày ${displayDate(record.date)} của ${record.employeeName}? Thao tác này không thể hoàn tác.`,
      confirmLabel: "Xóa",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeletingId(record.id);
    try {
      await accountService.deleteAttendance(record.id);
      notify({ type: "success", title: "Đã xóa chấm công" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể xóa chấm công", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setDeletingId(null);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formEmployeeId) {
      notify({ type: "error", title: "Vui lòng chọn nhân viên" });
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      // Filter out empty work items
      const validWorkItems = workItems.filter(item => item.description.trim() || item.detailId);
      const selectedTaskIds = formTaskIds.filter((taskId) => filteredTasks.some((task) => task.id === taskId));
      await accountService.saveAttendance({
        employeeId: String(form.get("employeeId") ?? ""),
        date: String(form.get("date") ?? ""),
        checkIn: String(form.get("checkIn") ?? ""),
        checkOut: String(form.get("checkOut") ?? ""),
        taskId: selectedTaskIds[0] ?? "",
        taskIds: selectedTaskIds,
        workDetail: JSON.stringify(validWorkItems.map(item => ({
          taskId: item.taskId,
          ...(item.detailId ? { detailId: item.detailId, detailTitle: item.detailTitle } : {}),
          description: item.description.trim() || item.detailTitle || "",
        }))),
      });
      setShowForm(false);
      setEditingRecord(null);
      notify({ type: "success", title: "Đã lưu chấm công" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể lưu chấm công", description: getErrorMessage(error, "Vui lòng kiểm tra thông tin và thử lại.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Clock3 size={16} /> Nhân viên</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Chấm công</h1>
          <p className="mt-1 text-sm text-slate-500">Theo dõi ngày, họ tên, giờ check-in và check-out.</p>
        </div>
        <Button onClick={openNewForm}><Plus size={16} /> Ghi nhận chấm công</Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bản ghi trong tháng" icon={CalendarDays} iconClassName="bg-violet-50 text-violet-600">
          <strong className="text-2xl font-bold text-gray-950">{records.length}</strong>
          <p className="mt-2 text-xs text-gray-400">Tháng {pad(month.getMonth() + 1)}/{month.getFullYear()}</p>
        </StatCard>
        <StatCard label="Đã check-in" icon={Clock3} iconClassName="bg-emerald-50 text-emerald-600">
          <strong className="text-2xl font-bold text-gray-950">{records.filter((record) => record.checkIn).length}</strong>
          <p className="mt-2 text-xs text-gray-400">{records.filter((record) => !record.checkIn).length} chưa check-in</p>
        </StatCard>
        <StatCard label="Đã check-out" icon={UsersRound} iconClassName="bg-indigo-50 text-indigo-600">
          <strong className="text-2xl font-bold text-gray-950">{records.filter((record) => record.checkOut).length}</strong>
          <p className="mt-2 text-xs text-gray-400">{records.filter((record) => record.checkIn && !record.checkOut).length} chưa check-out</p>
        </StatCard>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Tháng trước" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={18} /></button>
            <div className="min-w-36 text-center font-semibold text-slate-800">Tháng {pad(month.getMonth() + 1)}/{month.getFullYear()}</div>
            <button type="button" aria-label="Tháng sau" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={18} /></button>
          </div>
          <label className="relative block sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo họ tên hoặc mã NV" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 font-semibold">Ngày</th><th className="px-4 py-3 font-semibold">Họ tên</th><th className="px-4 py-3 font-semibold">Check-in</th><th className="px-4 py-3 font-semibold">Check-out</th><th className="px-4 py-3 font-semibold">Task / Việc chi tiết</th><th className="px-4 py-3 font-semibold">Giờ làm</th><th className="w-36 px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><LoaderCircle className="mr-2 inline animate-spin" size={18} />Đang tải dữ liệu...</td></tr> : filteredRecords.length ? filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">{displayDate(record.date)}</td>
                  <td className="px-4 py-3.5"><div className="font-medium text-slate-900">{record.employeeName}</div><div className="mt-0.5 text-xs text-slate-500">{record.employeeCode}</div></td>
                  <td className="px-4 py-3.5">{record.checkIn ? <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{record.checkIn}</span> : <span className="text-slate-400">Chưa ghi nhận</span>}</td>
                  <td className="px-4 py-3.5">{quickEditId === record.id ? <div className="flex items-center gap-1"><input type="time" aria-label={`Giờ check-out cho ${record.employeeName}`} value={quickTime} onChange={(event) => setQuickTime(event.target.value)} className="h-8 rounded-md border border-emerald-400 px-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100" />{record.checkIn && quickTime && quickTime < record.checkIn && <span title="Check-out sáng hôm sau" className="rounded bg-violet-100 px-1 text-[10px] font-semibold uppercase text-violet-700">+1 ngày</span>}<button type="button" onClick={() => confirmQuickCheckOut(record)} disabled={checkingOutId === record.id} aria-label={`Lưu check-out ${record.employeeName}`} title="Lưu check-out" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">{checkingOutId === record.id ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}</button><button type="button" onClick={() => setQuickEditId(null)} disabled={checkingOutId === record.id} aria-label="Hủy check-out nhanh" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button></div> : record.checkOut ? <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 font-medium text-violet-700">{record.checkOut}{isOvernight(record) && <span title="Check-out sáng hôm sau" className="rounded bg-violet-200/70 px-1 text-[10px] font-semibold uppercase">+1 ngày</span>}</span> : <span className="text-slate-400">Chưa ghi nhận</span>}</td>
                  <td className="max-w-64 px-4 py-3.5">{(() => {
                    const taskIds = record.taskIds?.length ? record.taskIds : record.taskId ? [record.taskId] : [];
                    if (!taskIds.length) return <span className="text-xs text-slate-400">Chưa gắn task</span>;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {taskIds.map((taskId) => {
                          const title = tasks.find((item) => item.id === taskId)?.title
                            ?? (taskId === record.taskId ? record.taskTitle : undefined)
                            ?? taskId;
                          return <span key={taskId} title={title} className="max-w-full truncate rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">{title}</span>;
                        })}
                      </div>
                    );
                  })()}{(() => {
                    const items = parseWorkItems(record.workDetail);
                    if (items.length === 0) return null;
                    return (
                      <div className="mt-1 space-y-1">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            {item.taskId && (
                              <span className="inline-flex items-center rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 whitespace-nowrap">
                                {tasks.find(t => t.id === item.taskId)?.title ?? item.taskId}
                              </span>
                            )}
                            {item.detailTitle && (
                              <span title={item.detailTitle} className="inline-flex items-center rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 whitespace-nowrap">
                                {item.detailTitle}
                              </span>
                            )}
                            {item.description && item.description !== item.detailTitle && (
                              <span className="text-slate-600 whitespace-pre-line">{item.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-700">{formatWorkDuration(workMinutes(record))}</td>
                  <td className="px-4 py-3.5"><div className="flex items-center gap-1">{record.checkIn && !record.checkOut && <button type="button" onClick={() => openQuickCheckOut(record)} aria-label={`Check-out ${record.employeeName} ngay`} title="Check-out ngay với giờ hiện tại" className={`rounded-md p-2 hover:bg-emerald-50 ${quickEditId === record.id ? "bg-emerald-50 text-emerald-700" : "text-emerald-600"}`}>{checkingOutId === record.id ? <LoaderCircle size={16} className="animate-spin" /> : <LogOut size={16} />}</button>}<button type="button" onClick={() => openEditForm(record)} aria-label={`Sửa chấm công ${record.employeeName}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={16} /></button><button type="button" onClick={() => removeRecord(record)} disabled={deletingId === record.id} aria-label={`Xóa chấm công ${record.employeeName}`} title="Xóa chấm công" className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{deletingId === record.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div></td>
                </tr>
              )) : <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Chưa có dữ liệu chấm công trong tháng này.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Hiển thị {filteredRecords.length} / {records.length} bản ghi</div>
      </section>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-start justify-between">
            <div><h2 id="attendance-dialog-title" className="text-lg font-semibold text-slate-900">{editingRecord ? "Cập nhật chấm công" : "Ghi nhận chấm công"}</h2><p className="mt-1 text-sm text-slate-500">Mỗi nhân viên có một bản ghi cho mỗi ngày.</p></div>
            <button type="button" disabled={saving} onClick={() => setShowForm(false)} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Nhân viên</span><SearchableSelect name="employeeId" value={formEmployeeId} onChange={setFormEmployeeId} placeholder="Chọn nhân viên" searchPlaceholder="Tìm theo tên hoặc mã nhân viên..." options={employees.map((employee) => ({ value: employee.id, label: employee.name, sublabel: employee.employeeCode }))} /></div>
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Ngày</span><input required type="date" name="date" defaultValue={editingRecord?.date ?? dateKey(new Date())} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <div><span className="mb-1 block text-sm font-medium text-slate-700">Lọc theo dự án</span><SearchableMultiSelect values={filterProjectIds} onChange={handleFilterProjectChange} placeholder="Tất cả dự án" searchPlaceholder="Tìm dự án..." options={projects.map((project) => ({ value: project.id, label: project.name }))} /></div>
            <div><span className="mb-1 block text-sm font-medium text-slate-700">Lọc theo công việc</span><SearchableMultiSelect values={filterWorkTaskIds} onChange={handleFilterWorkTaskChange} placeholder="Tất cả công việc" searchPlaceholder="Tìm công việc..." disabled={!workTasks.length} options={filteredWorkTasks.map((workTask) => ({ value: workTask.id, label: workTask.title }))} /></div>
            <div className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Task thực hiện <span className="font-normal text-slate-400">(không bắt buộc{filteredTasks.length !== tasks.length ? ` · ${filteredTasks.length}/${tasks.length} task` : ""})</span></span><SearchableMultiSelect values={formTaskIds} onChange={setFormTaskIds} placeholder="Chưa gắn task" searchPlaceholder="Tìm task..." options={filteredTasks.map((task) => ({ value: task.id, label: task.title }))} /></div>
            <div className="sm:col-span-2" role="group" aria-labelledby="attendance-work-items-label"><span id="attendance-work-items-label" className="mb-1 block text-sm font-medium text-slate-700">Việc chi tiết trong ngày <span className="font-normal text-slate-400">(không bắt buộc)</span></span>
              <div className="space-y-2">
                {workItems.map((item, index) => {
                  const selectedTask = tasks.find((task) => task.id === item.taskId);
                  const detailOptions = selectedTask?.details ?? [];
                  return (
                    <div key={index} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-2.5">
                      <div className="flex gap-2">
                        <SearchableSelect
                          value={item.taskId}
                          onChange={(nextValue) => handleWorkItemTaskChange(index, nextValue)}
                          placeholder="Chọn task (tùy chọn)"
                          searchPlaceholder="Tìm task..."
                          className="min-w-0 flex-1"
                          options={[{ value: "", label: "Chọn task (tùy chọn)" }, ...filteredTasks.map((task) => ({ value: task.id, label: task.title }))]}
                        />
                        <SearchableSelect
                          value={item.detailId ?? ""}
                          onChange={(nextValue) => handleWorkItemDetailChange(index, nextValue)}
                          placeholder={!item.taskId ? "Chọn task trước" : detailOptions.length ? "Chọn chi tiết Task" : "Task chưa có chi tiết"}
                          searchPlaceholder="Tìm chi tiết Task..."
                          disabled={!item.taskId || detailOptions.length === 0}
                          className="min-w-0 flex-1"
                          options={[
                            { value: "", label: "Không chọn chi tiết" },
                            ...detailOptions.map((detail) => ({
                              value: detail.id,
                              label: detail.title,
                              sublabel: `#${detail.index}${detail.createdAt ? ` · ${displayDate(detail.createdAt.slice(0, 10))}` : ""}`,
                            })),
                          ]}
                        />
                        {workItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setWorkItems(curr => curr.filter((_, i) => i !== index))}
                            className="h-10 w-10 shrink-0 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                            aria-label="Xóa việc này"
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        aria-label="Mô tả việc làm"
                        value={item.description}
                        onChange={(e) => setWorkItems(curr => curr.map((it, i) => i === index ? { ...it, description: e.target.value } : it))}
                        placeholder="Mô tả việc làm..."
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setWorkItems(curr => [...curr, { taskId: "", description: "" }])}
                  className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50 text-sm font-medium"
                >
                  <Plus size={16} /> Thêm việc khác
                </button>
                <p className="text-[11px] text-slate-400">Mỗi việc có thể gắn task riêng. Để trống task nếu việc không thuộc task cụ thể.</p>
              </div>
            </div>
            <div><div className="mb-1 flex items-center justify-between"><label htmlFor="attendance-check-in" className="text-sm font-medium text-slate-700">Check-in</label><Button type="button" variant="ghost" size="sm" onClick={() => setCheckIn(currentTime())}><Clock3 size={14} /> Bây giờ</Button></div><input id="attendance-check-in" type="time" name="checkIn" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            <div><div className="mb-1 flex items-center justify-between"><label htmlFor="attendance-check-out" className="text-sm font-medium text-slate-700">Check-out</label><Button type="button" variant="ghost" size="sm" onClick={() => setCheckOut(currentTime())}><Clock3 size={14} /> Bây giờ</Button></div><input id="attendance-check-out" type="time" name="checkOut" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />{checkIn && checkOut && checkOut < checkIn && <p className="mt-1 text-xs text-violet-600">Ca qua đêm: check-out được tính sang sáng hôm sau.</p>}</div>
            <div className="mt-1 flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setShowForm(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle size={16} className="animate-spin" />} Lưu chấm công</Button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
