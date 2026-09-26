"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { accountService } from "@/services/account-service";
import type { EmployeeAccount, EmployeeWorkSchedule } from "@/types/account";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_OPTIONS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function WorkScheduleManagementPage() {
  const { notify } = useFeedback();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [schedules, setSchedules] = useState<EmployeeWorkSchedule[]>([]);
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [saving, setSaving] = useState(false);

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

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-base font-semibold capitalize text-slate-800">{new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(month)}</h2>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>Hôm nay</Button>
            <button aria-label="Tháng trước" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            <button aria-label="Tháng sau" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

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
                </div>)}
              </div>
            </div>;
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-500">
          <span>{schedules.length} lịch trong tháng</span>
          {loading && <span className="inline-flex items-center gap-1"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Đang tải</span>}
        </div>
      </section>

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
