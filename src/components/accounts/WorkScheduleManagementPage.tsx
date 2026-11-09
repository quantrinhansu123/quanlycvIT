"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, List, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { accountService } from "@/services/account-service";
import { formatDateVN } from "@/lib/utils";
import type { EmployeeAccount, EmployeeAttendance, EmployeeWorkSchedule } from "@/types/account";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_OPTIONS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const weekdayOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
};
/** Số phút của một buổi làm; qua đêm thì cộng thêm 24h. */
const scheduleMinutes = (schedule: EmployeeWorkSchedule) => {
  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
};
const formatHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${pad(rest)} phút` : `${hours} giờ`;
};

export function WorkScheduleManagementPage() {
  const { notify, confirm } = useFeedback();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [schedules, setSchedules] = useState<EmployeeWorkSchedule[]>([]);
  const [onlineEmployees, setOnlineEmployees] = useState<EmployeeAttendance[]>([]);
  const [onlineStatusError, setOnlineStatusError] = useState(false);
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "calendar">("table");
  const [detail, setDetail] = useState<EmployeeWorkSchedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const startDate = dateKey(month);
    const endDate = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    try {
      setSchedules(await accountService.getWorkSchedulesForPeriod(startDate, endDate));
    } catch (error) {
      notify({ type: "error", title: "Không thể tải lịch làm việc", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setLoading(false);
    }
  }, [month, notify]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    const refreshOnlineEmployees = async () => {
      const today = dateKey(new Date());
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = dateKey(tomorrowDate);
      try {
        const attendance = await accountService.getAttendanceForPeriod(today, tomorrow);
        if (active) {
          setOnlineEmployees(attendance.filter((record) => record.checkIn && !record.checkOut));
          setOnlineStatusError(false);
        }
      } catch {
        if (active) setOnlineStatusError(true);
      }
    };
    void refreshOnlineEmployees();
    const interval = window.setInterval(() => { void refreshOnlineEmployees(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    accountService.getAnalytics()
      .then((directory) => setEmployees(directory.accounts.filter((account) => account.status === "active")))
      .catch((error: unknown) => notify({ type: "error", title: "Không thể tải danh sách nhân viên", description: getErrorMessage(error, "Vui lòng thử lại.") }));
  }, [notify]);

  const schedulesByDate = useMemo(() => {
    const grouped = new Map<string, EmployeeWorkSchedule[]>();
    for (const schedule of schedules) {
      const items = grouped.get(schedule.date) ?? [];
      items.push(schedule);
      grouped.set(schedule.date, items);
    }
    return grouped;
  }, [schedules]);

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) =>
      a.date === b.date
        ? a.startTime.localeCompare(b.startTime) || (a.employeeName ?? "").localeCompare(b.employeeName ?? "")
        : a.date.localeCompare(b.date)
    );
  }, [schedules]);

  const cells = useMemo(() => {
    const firstWeekday = month.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const daysInPreviousMonth = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
    return Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1) return { date: new Date(month.getFullYear(), month.getMonth() - 1, daysInPreviousMonth + dayNumber), current: false };
      if (dayNumber > daysInMonth) return { date: new Date(month.getFullYear(), month.getMonth() + 1, dayNumber - daysInMonth), current: false };
      return { date: new Date(month.getFullYear(), month.getMonth(), dayNumber), current: true };
    });
  }, [month]);

  async function remove(schedule: EmployeeWorkSchedule) {
    if (deletingId) return;
    setDeletingId(schedule.id);
    try {
      const confirmed = await confirm({
        title: "Xóa lịch làm việc?",
        description: `Xóa buổi làm của ${schedule.employeeName ?? schedule.employeeCode ?? "nhân viên"} ngày ${schedule.date.split("-").reverse().join("/")}, ${schedule.startTime.slice(0, 5)}–${schedule.endTime.slice(0, 5)}? Thao tác này không thể hoàn tác.`,
        confirmLabel: "Xóa lịch",
        tone: "danger",
      });
      if (!confirmed) return;
      await accountService.deleteWorkSchedule(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      notify({ type: "success", title: "Đã xóa lịch làm việc" });
    } catch (error) {
      notify({ type: "error", title: "Không thể xóa lịch làm việc", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setDeletingId(null);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId") ?? "");
    setSaving(true);
    try {
      await accountService.createGlobalWorkSchedule(employeeId, {
        date: String(form.get("date") ?? ""),
        startTime: String(form.get("startTime") ?? ""),
        endTime: String(form.get("endTime") ?? ""),
        note: String(form.get("note") ?? ""),
      });
      setShowForm(false);
      notify({ type: "success", title: "Đã thêm lịch làm việc" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể thêm lịch", description: getErrorMessage(error, "Vui lòng kiểm tra thông tin và thử lại.") });
    } finally {
      setSaving(false);
    }
  }

  async function saveWeekly(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId") ?? "");
    const startDate = String(form.get("startDate") ?? "");
    const endDate = String(form.get("endDate") ?? "");
    const weekdays = new Set(form.getAll("weekdays").map(Number));
    if (!weekdays.size) {
      notify({ type: "error", title: "Chưa chọn thứ", description: "Hãy chọn ít nhất một ngày trong tuần." });
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      notify({ type: "error", title: "Khoảng ngày không hợp lệ", description: "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu." });
      return;
    }

    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");
    const note = String(form.get("note") ?? "");
    const occurrences: Array<{ date: string; startTime: string; endTime: string; note: string }> = [];
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
    const cursor = new Date(startYear, startMonth - 1, startDay);
    const lastDay = new Date(endYear, endMonth - 1, endDay);
    while (cursor <= lastDay && occurrences.length <= 370) {
      if (weekdays.has(cursor.getDay())) {
        occurrences.push({ date: dateKey(cursor), startTime, endTime, note });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (occurrences.length > 370) {
      notify({ type: "error", title: "Khoảng đăng ký quá dài", description: "Mỗi lần đăng ký tối đa 370 buổi." });
      return;
    }
    if (!occurrences.length) {
      notify({ type: "error", title: "Không có buổi phù hợp", description: "Khoảng ngày đã chọn không có ngày nào khớp với thứ đã chọn." });
      return;
    }

    setSaving(true);
    try {
      const created = await accountService.createWeeklyWorkSchedules(employeeId, occurrences);
      setShowWeeklyForm(false);
      notify({
        type: "success",
        title: created.length ? `Đã điền ${created.length} buổi vào lịch` : "Các buổi này đã có trong lịch",
        ...(created.length < occurrences.length ? { description: `Bỏ qua ${occurrences.length - created.length} buổi bị trùng.` } : {}),
      });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể đăng ký theo tuần", description: getErrorMessage(error, "Vui lòng kiểm tra thông tin và thử lại.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-slate-50 p-4 sm:p-6">
      <section className="mx-auto w-full max-w-7xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><CalendarDays className="h-5 w-5" /></span>
            <div><h1 className="text-lg font-bold text-slate-900">Lịch làm việc</h1><p className="text-sm text-slate-500">Lịch phân công theo nhân viên</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowWeeklyForm(true)}><CalendarDays className="h-4 w-4" /> Đăng ký theo tuần</Button>
            <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Thêm mới</Button>
          </div>
        </header>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {!onlineStatusError && <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Đang online <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs">{onlineEmployees.length}</span></span>}
            {onlineStatusError && <span className="text-sm text-amber-700">Không tải được trạng thái chấm công.</span>}
          </div>
          {!onlineStatusError && (onlineEmployees.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="sr-only">Nhân viên đang online (đã check-in hôm nay)</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Nhân viên</th>
                    <th className="px-4 py-2 font-semibold">Mã NV</th>
                    <th className="px-4 py-2 font-semibold">Check-in</th>
                    <th className="px-4 py-2 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {onlineEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{employee.employeeName}</td>
                      <td className="px-4 py-2.5 text-slate-500">{employee.employeeCode || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-emerald-500" />{employee.checkIn ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Đang online</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Chưa có nhân viên check-in hôm nay.</p>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-base font-semibold capitalize text-slate-800">{new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(month)}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setView("table")}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <List className="h-3.5 w-3.5" /> Danh sách
              </button>
              <button
                type="button"
                onClick={() => setView("calendar")}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${view === "calendar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Lịch
              </button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>Hôm nay</Button>
            <button aria-label="Tháng trước" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <button aria-label="Tháng sau" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        {view === "table" ? (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Danh sách nhân sự đăng ký lịch làm việc trong tháng</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ngày</th>
                  <th className="px-4 py-3 font-semibold">Nhân viên</th>
                  <th className="px-4 py-3 font-semibold">Giờ làm</th>
                  <th className="px-4 py-3 font-semibold">Tổng giờ</th>
                  <th className="px-4 py-3 font-semibold">Ghi chú</th>
                  <th className="w-16 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Đang tải lịch làm việc...</td></tr>
                ) : sortedSchedules.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Chưa có nhân sự nào đăng ký lịch trong tháng này.</td></tr>
                ) : sortedSchedules.map((schedule) => (
                  <tr
                    key={schedule.id}
                    onClick={() => setDetail(schedule)}
                    className="cursor-pointer transition-colors hover:bg-violet-50/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-medium text-slate-800">{formatDateVN(schedule.date)}</span>
                      <span className="ml-2 text-xs text-slate-400">{weekdayOf(schedule.date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{schedule.employeeName ?? "Nhân viên"}</div>
                      {schedule.employeeCode && <div className="mt-0.5 text-xs text-slate-500">{schedule.employeeCode}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-violet-500" />{schedule.startTime.slice(0, 5)} – {schedule.endTime.slice(0, 5)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatHours(scheduleMinutes(schedule))}</td>
                    <td className="max-w-64 px-4 py-3">
                      <span className="block truncate text-slate-600" title={schedule.note ?? undefined}>{schedule.note || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); void remove(schedule); }}
                        disabled={deletingId !== null || loading}
                        aria-label={`Xóa lịch của ${schedule.employeeName ?? schedule.employeeCode ?? "nhân viên"} ngày ${schedule.date}`}
                        title="Xóa lịch làm việc"
                        className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === schedule.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="grid grid-cols-7 border-l border-t border-slate-200">
          {WEEKDAYS.map((day) => <div key={day} className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-500">{day}</div>)}
          {cells.map(({ date, current }, index) => {
            const key = dateKey(date);
            const events = schedulesByDate.get(key) ?? [];
            return <div key={`${key}-${index}`} className={`min-h-28 border-b border-r border-slate-200 p-1.5 sm:min-h-36 sm:p-2 ${current ? "bg-white" : "bg-slate-50/70"}`}>
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${current ? "font-semibold text-slate-700" : "text-slate-300"}`}>{date.getDate()}</div>
              <div className="space-y-1">
                {events.map((event) => <div key={event.id} title={`${event.employeeName ?? "Nhân viên"} · ${event.startTime.slice(0, 5)}–${event.endTime.slice(0, 5)}${event.note ? ` · ${event.note}` : ""}`} className="rounded-md bg-violet-50 px-1.5 py-1 text-[10px] leading-4 text-violet-800 sm:text-xs">
                  <div className="flex items-center gap-1 font-semibold"><Clock3 className="h-3 w-3 shrink-0" />{event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}</div>
                  <div className="truncate">{event.employeeName ?? event.employeeCode ?? "Nhân viên"}</div>
                  <button
                    type="button"
                    onClick={() => void remove(event)}
                    disabled={deletingId !== null || loading}
                    aria-label={`Xóa lịch của ${event.employeeName ?? event.employeeCode ?? "nhân viên"} ngày ${event.date}, ${event.startTime.slice(0, 5)}–${event.endTime.slice(0, 5)}`}
                    title="Xóa lịch làm việc"
                    className="mt-1 inline-flex items-center gap-1 rounded px-1 py-1 text-rose-600 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === event.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Xóa
                  </button>
                </div>)}
              </div>
            </div>;
          })}
        </div>
        )}
        <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
          <span>{schedules.length} lịch trong tháng</span>
          {loading && <span className="inline-flex items-center gap-1"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Đang tải</span>}
        </div>
      </section>

      {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="work-schedule-detail-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="work-schedule-detail-title" className="text-lg font-bold text-slate-900">Chi tiết lịch đăng ký</h2>
              <p className="mt-1 text-sm text-slate-500">Thông tin buổi làm đã đăng ký cho nhân viên.</p>
            </div>
            <button type="button" onClick={() => setDetail(null)} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-slate-500">Nhân viên</dt>
              <dd className="text-right text-sm font-semibold text-slate-900">{detail.employeeName ?? "Nhân viên"}{detail.employeeCode ? <span className="ml-1 font-normal text-slate-400">· {detail.employeeCode}</span> : null}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-slate-500">Ngày</dt>
              <dd className="text-right text-sm font-medium text-slate-800">{formatDateVN(detail.date)} <span className="text-slate-400">({weekdayOf(detail.date)})</span></dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-slate-500">Giờ làm</dt>
              <dd className="text-right text-sm font-medium text-slate-800">{detail.startTime.slice(0, 5)} – {detail.endTime.slice(0, 5)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-slate-500">Tổng giờ</dt>
              <dd className="text-right text-sm font-medium text-slate-800">{formatHours(scheduleMinutes(detail))}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-slate-500">Ghi chú</dt>
              <dd className="whitespace-pre-line text-right text-sm text-slate-700">{detail.note || "—"}</dd>
            </div>
          </dl>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { const target = detail; setDetail(null); void remove(target); }}
              disabled={deletingId !== null || loading}
            >
              <Trash2 className="h-4 w-4" /> Xóa lịch
            </Button>
            <Button onClick={() => setDetail(null)}>Đóng</Button>
          </div>
        </section>
      </div>}

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <form onSubmit={(event) => void save(event)} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Thêm lịch làm việc</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Nhân viên</span><select required name="employeeId" defaultValue="" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"><option value="" disabled>Chọn nhân viên</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeCode}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Ngày</span><input required type="date" name="date" defaultValue={dateKey(month)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Giờ bắt đầu</span><input required type="time" name="startTime" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Giờ kết thúc</span><input required type="time" name="endTime" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</span><textarea name="note" maxLength={1000} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Hủy</Button><Button type="submit" disabled={saving || employees.length === 0}>{saving ? "Đang lưu..." : "Lưu lịch"}</Button></div>
        </form>
      </div>}

      {showWeeklyForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowWeeklyForm(false); }}>
        <form onSubmit={(event) => void saveWeekly(event)} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Đăng ký lịch theo tuần</h2><p className="mt-1 text-sm text-slate-500">Các ngày khớp sẽ được tự động thêm vào lịch.</p></div><button type="button" onClick={() => setShowWeeklyForm(false)} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Nhân viên</span><select required name="employeeId" defaultValue="" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"><option value="" disabled>Chọn nhân viên</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeCode}</option>)}</select></label>
            <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-700">Lặp vào thứ</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{WEEKDAY_OPTIONS.map((label, day) => <label key={day} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" name="weekdays" value={day} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />{label}</label>)}</div></fieldset>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Từ ngày</span><input required type="date" name="startDate" defaultValue={dateKey(month)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Đến ngày</span><input required type="date" name="endDate" defaultValue={dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Giờ bắt đầu</span><input required type="time" name="startTime" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label><span className="mb-1 block text-sm font-medium text-slate-700">Giờ kết thúc</span><input required type="time" name="endTime" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</span><textarea name="note" maxLength={1000} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowWeeklyForm(false)}>Hủy</Button><Button type="submit" disabled={saving || employees.length === 0}>{saving ? "Đang điền lịch..." : "Tạo lịch tuần"}</Button></div>
        </form>
      </div>}
    </main>
  );
}
