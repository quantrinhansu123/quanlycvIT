"use client";

import Link from "next/link";
import {
  AlertCircle, BadgeCheck, Banknote, BriefcaseBusiness, Building2, CalendarDays,
  ChevronDown, CircleUserRound, ContactRound, FilterX, Info, MailCheck, PhoneOff,
  RefreshCw, ShieldCheck, TrendingUp, UserCheck, UserPlus, UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { accountService } from "@/services/account-service";
import type { AccountRole, AccountStatus, Department, EmployeeAccount } from "@/types/account";

const ROLE_LABEL: Record<AccountRole, string> = {
  admin: "Quản trị", manager: "Quản lý", member: "Nhân viên",
};
const ROLE_COLOR: Record<AccountRole, string> = {
  admin: "#8b5cf6", manager: "#2563eb", member: "#10b981",
};
const COLORS = ["#10b981", "#2563eb", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const FIELDS = [
  { key: "phone", label: "Số điện thoại", has: (x: EmployeeAccount) => Boolean(x.phone) },
  { key: "bank", label: "Ngân hàng", has: (x: EmployeeAccount) => Boolean(x.bankAccount && x.bankName) },
  { key: "email", label: "Kênh thông báo", has: (x: EmployeeAccount) => Boolean(x.email) },
  { key: "avatar", label: "Ảnh đại diện", has: (x: EmployeeAccount) => Boolean(x.avatarUrl) },
] as const;

const avatarColor = (name: string) => {
  const colors = ["#2563eb", "#7c3aed", "#e11d48", "#ea580c", "#059669", "#0891b2"];
  return colors[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length];
};
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthsAtCompany = (value?: string) => {
  if (!value) return 0;
  const start = new Date(value), now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
};
const tenure = (months: number) => months < 12
  ? `${months} tháng`
  : `${Math.floor(months / 12)} năm${months % 12 ? ` ${months % 12} tháng` : ""}`;
const annualDays = (value?: string) => {
  if (!value) return null;
  const date = new Date(value), now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), date.getMonth(), date.getDate());
  if (target < today) target = new Date(now.getFullYear() + 1, date.getMonth(), date.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

function SelectFilter({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="relative min-w-0 sm:min-w-48">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-brand-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
    </label>
  );
}

function Panel({ title, subtitle, icon: Icon, children, className = "" }: {
  title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-slate-950">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function StatCard({ label, value, note, icon: Icon, tone, onClick }: {
  label: string; value: number; note: string; icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "violet" | "amber" | "rose"; onClick?: () => void;
}) {
  const styles = {
    blue: "bg-brand-50 text-brand-600", emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value.toLocaleString("vi-VN")}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${styles[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-sm text-slate-500">{note}</p>
    </Tag>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center text-sm text-slate-500">{children}</div>;
}

function ChartTip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`pointer-events-none absolute z-30 w-max max-w-56 rounded-lg bg-slate-950 px-2.5 py-1.5 text-center text-xs font-medium leading-5 text-white opacity-0 shadow-xl transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${className}`}>
      {children}
    </span>
  );
}

export function HRAnalyticsPage() {
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [role, setRole] = useState<AccountRole | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const result = await accountService.getAll();
      setAccounts(result.accounts); setDepartments(result.departments);
    } catch {
      setError("Không thể tải dữ liệu nhân sự. Vui lòng kiểm tra kết nối và thử lại.");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;

    accountService.getAll()
      .then((result) => {
        if (!active) return;
        setAccounts(result.accounts);
        setDepartments(result.departments);
      })
      .catch(() => {
        if (!active) return;
        setError("Không thể tải dữ liệu nhân sự. Vui lòng kiểm tra kết nối và thử lại.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => accounts.filter((x) =>
    (!department || x.departmentId === department) &&
    (!status || x.status === status) && (!role || x.role === role)
  ), [accounts, department, status, role]);
  const missing = (x: EmployeeAccount) => FIELDS.filter((field) => !field.has(x)).map((field) => field.label);

  const deptStats = useMemo(() => departments.map((dept, index) => {
    const people = filtered.filter((x) => x.departmentId === dept.id);
    return {
      ...dept, people, color: COLORS[index % COLORS.length],
      active: people.filter((x) => x.status === "active").length,
      inactive: people.filter((x) => x.status === "inactive").length,
    };
  }).filter((x) => x.people.length).sort((a, b) => b.people.length - a.people.length), [departments, filtered]);

  const active = filtered.filter((x) => x.status === "active").length;
  const assigned = filtered.filter((x) => x.departmentId).length;
  const positions = new Set(filtered.map((x) => x.position).filter(Boolean));
  const newThisMonth = filtered.filter((x) => {
    const date = x.startDate || x.createdAt;
    return date && monthKey(new Date(date)) === monthKey(new Date());
  }).length;
  const missingPeople = filtered.map((item) => ({ item, fields: missing(item) }))
    .filter((x) => x.fields.length).sort((a, b) => b.fields.length - a.fields.length);
  const avgTenure = filtered.length
    ? Math.round(filtered.reduce((sum, x) => sum + monthsAtCompany(x.startDate), 0) / filtered.length) : 0;
  const probation = filtered.filter((x) => x.startDate && monthsAtCompany(x.startDate) < 3 && x.status === "active");
  const birthdays = filtered.map((item) => ({ item, days: annualDays(item.birthDate) }))
    .filter((x): x is { item: EmployeeAccount; days: number } => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days);

  const roles = (Object.keys(ROLE_LABEL) as AccountRole[]).map((key) => ({
    key, label: ROLE_LABEL[key], value: filtered.filter((x) => x.role === key).length,
  })).filter((x) => x.value);
  const roleTotal = Math.max(1, roles.reduce((sum, x) => sum + x.value, 0));
  let stop = 0;
  const donut = roles.map((x) => {
    const start = stop; stop += x.value / roleTotal * 360;
    return `${ROLE_COLOR[x.key]} ${start}deg ${stop}deg`;
  }).join(", ");

  const months = Array.from({ length: 6 }, (_, index) => {
    const now = new Date(), date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    return {
      key, label: `T${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`,
      joined: filtered.filter((x) => {
        const value = x.startDate || x.createdAt;
        return value && monthKey(new Date(value)) === key;
      }).length,
      retained: filtered.filter((x) => {
        const value = x.startDate || x.createdAt;
        return x.status === "active" && value && monthKey(new Date(value)) <= key;
      }).length,
    };
  });
  const hireMax = Math.max(1, ...months.flatMap((x) => [x.joined, x.retained]));
  const coverage = FIELDS.map((field) => {
    const count = filtered.filter(field.has).length;
    return { ...field, count, percent: filtered.length ? Math.round(count / filtered.length * 100) : 0 };
  });
  const positionStats = [...positions].map((position) => ({
    position: position as string, count: filtered.filter((x) => x.position === position).length,
  })).sort((a, b) => b.count - a.count).slice(0, 5);
  const positionMax = Math.max(1, ...positionStats.map((x) => x.count));

  if (loading) return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3"><div className="h-96 animate-pulse rounded-2xl bg-slate-200 lg:col-span-2" /><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>
    </div>
  );

  if (error) return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="mt-4 text-lg font-semibold text-slate-950">Dữ liệu chưa sẵn sàng</h1>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      </div>
    </div>
  );

  const hasFilters = Boolean(department || status || role);
  return (
    <div className="min-h-full bg-slate-50/70">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><h1 className="font-semibold text-slate-950">Thống kê nhân sự</h1><p className="text-sm text-slate-500">Tổng quan nguồn lực và mức độ hoàn thiện hồ sơ</p></div>
          <div className="grid gap-2 sm:grid-cols-3">
            <SelectFilter label="Phòng ban" value={department} onChange={setDepartment}>
              <option value="">Tất cả phòng ban</option>{departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </SelectFilter>
            <SelectFilter label="Trạng thái" value={status} onChange={(v) => setStatus(v as AccountStatus | "")}>
              <option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Tạm nghỉ / Đã khóa</option>
            </SelectFilter>
            <SelectFilter label="Vai trò" value={role} onChange={(v) => setRole(v as AccountRole | "")}>
              <option value="">Tất cả vai trò</option><option value="admin">Quản trị</option><option value="manager">Quản lý</option><option value="member">Nhân viên</option>
            </SelectFilter>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
        <details className="group rounded-2xl border border-brand-100 bg-brand-50/70 shadow-sm open:bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand-700 outline-none transition hover:text-brand-900 focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-5">
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Cách tính số liệu trên trang
            </span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-brand-100 px-4 py-4 text-sm text-slate-600 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Nhân sự mới</strong>
              <span>Tính theo ngày vào làm. Nếu chưa có ngày vào làm, hệ thống dùng ngày tạo hồ sơ.</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Đang thử việc</strong>
              <span>Là nhân sự đang hoạt động và có thời gian làm việc dưới 3 tháng.</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Hồ sơ thiếu</strong>
              <span>Kiểm tra 4 nhóm thông tin: điện thoại, ngân hàng, email và ảnh đại diện.</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Kênh thông báo</strong>
              <span>Được xem là đã liên kết khi hồ sơ nhân sự có địa chỉ email.</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Tài khoản khóa và nghỉ việc</strong>
              <span>Tài khoản khóa có trạng thái tạm ngưng; nghỉ việc là hồ sơ đã có ngày nghỉ.</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-900">Phạm vi thời gian</strong>
              <span>Sinh nhật tính trong 30 ngày tới; xu hướng tuyển dụng tính trong 6 tháng gần nhất.</span>
            </div>
          </div>
        </details>

        {hasFilters && <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50 px-4 py-2 text-sm text-brand-700">
          <span>Đang hiển thị {filtered.length}/{accounts.length} nhân sự theo bộ lọc.</span>
          <button type="button" onClick={() => { setDepartment(""); setStatus(""); setRole(""); }} className="inline-flex items-center gap-1.5 font-semibold hover:text-brand-900"><FilterX className="h-4 w-4" /> Xóa lọc</button>
        </div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Tổng nhân sự" value={filtered.length} note={`${active} hoạt động, ${filtered.length - active} tạm nghỉ`} icon={UsersRound} tone="blue" />
          <StatCard label="Phòng ban" value={deptStats.length} note={`${filtered.length ? Math.round(assigned / filtered.length * 100) : 0}% nhân sự đã phân phòng`} icon={Building2} tone="emerald" />
          <StatCard label="Chức vụ" value={positions.size} note={`Thâm niên TB ${tenure(avgTenure)}`} icon={BriefcaseBusiness} tone="violet" />
          <StatCard label="Mới tháng này" value={newThisMonth} note={`${probation.length} nhân sự làm việc dưới 3 tháng`} icon={TrendingUp} tone="emerald" />
          <StatCard label="Hồ sơ thiếu" value={missingPeople.length} note={`Thiếu ít nhất 1 trong 4 nhóm thông tin`} icon={AlertCircle} tone="amber" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Phân bổ theo phòng ban" subtitle="Nhân sự hoạt động và tạm nghỉ theo đơn vị" icon={Building2} className="lg:col-span-2">
            <div className="p-5">
              {deptStats.length ? <div className="flex h-72 items-end gap-4 border-b border-l border-dashed border-slate-200 px-3 pt-5 sm:gap-7 sm:px-6">
                {deptStats.map((x, index) => {
                  const max = Math.max(...deptStats.map((d) => d.people.length));
                  const tipPosition = index === 0
                    ? "left-0"
                    : index === deptStats.length - 1
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2";
                  return <button key={x.id} type="button" onClick={() => setDepartment(x.id)} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Lọc theo ${x.name}: ${x.active} hoạt động, ${x.inactive} tạm nghỉ`}>
                    <div className="relative flex w-full max-w-36 flex-col justify-end overflow-hidden rounded-t-lg shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-md" style={{ height: `${Math.max(12, x.people.length / max * 82)}%` }}>
                      {x.inactive > 0 && <div className="bg-amber-400" style={{ height: `${x.inactive / x.people.length * 100}%` }} />}
                      <div className="bg-emerald-500" style={{ height: `${x.active / x.people.length * 100}%` }} />
                    </div>
                    <ChartTip className={`top-2 ${tipPosition}`}>
                      <strong className="block">{x.name}</strong>
                      {x.active} hoạt động · {x.inactive} tạm nghỉ
                    </ChartTip>
                    <span className="mt-3 line-clamp-2 min-h-10 text-center text-xs font-medium text-slate-600 sm:text-sm">{x.name}</span>
                  </button>;
                })}
              </div> : <Empty>Chưa có nhân sự thuộc phòng ban trong bộ lọc này.</Empty>}
              <div className="mt-4 flex justify-center gap-5 text-xs text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Hoạt động</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Tạm nghỉ</span></div>
            </div>
          </Panel>

          <Panel title="Trạng thái & vai trò" subtitle="Tỉ trọng nhân sự theo vai trò vận hành" icon={BadgeCheck}>
            <div className="p-5">
              <div tabIndex={0} className="group relative mx-auto h-44 w-44 rounded-full transition-transform duration-500 hover:rotate-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100" style={{ background: roles.length ? `conic-gradient(${donut})` : "#e2e8f0" }} aria-label={`Cơ cấu vai trò: ${roles.map((x) => `${x.label} ${x.value}`).join(", ")}`}>
                <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white shadow-inner"><span className="text-3xl font-bold text-slate-950">{filtered.length}</span><span className="text-xs text-slate-500">nhân sự</span></div>
                <ChartTip className="bottom-4 left-1/2 -translate-x-1/2">
                  {roles.map((x) => <span key={x.key} className="block">{x.label}: {x.value} ({Math.round(x.value / roleTotal * 100)}%)</span>)}
                </ChartTip>
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {roles.map((x) => <button key={x.key} type="button" onClick={() => setRole(x.key)} className="rounded-xl border border-slate-200 p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                  <span className="flex items-center gap-2 text-xs text-slate-500"><i className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLOR[x.key] }} />{x.label}</span><strong className="mt-1 block text-xl text-slate-950">{x.value}</strong><span className="text-xs text-slate-500">{Math.round(x.value / roleTotal * 100)}% tổng số</span>
                </button>)}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Tuyển mới 6 tháng gần nhất" subtitle="Dựa trên ngày vào làm hoặc ngày tạo hồ sơ" icon={CalendarDays} className="lg:col-span-2">
            <div className="p-5">
              <div className="relative h-64 border-b border-l border-dashed border-slate-200">
                {[0, 25, 50, 75, 100].map((n) => <i key={n} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ bottom: `${n}%` }} />)}
                <div className="absolute inset-0 flex items-end justify-around gap-2 px-2">
                  {months.map((x, index) => <div key={x.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`${x.label}: ${x.joined} tuyển mới, ${x.retained} còn hoạt động`}>
                    <div className="w-3 rounded-t bg-brand-600 transition group-hover:bg-brand-700 sm:w-5" style={{ height: `${Math.max(x.joined ? 6 : 1, x.joined / hireMax * 82)}%` }} />
                    <div className="w-3 rounded-t bg-emerald-500 transition group-hover:bg-emerald-600 sm:w-5" style={{ height: `${Math.max(x.retained ? 6 : 1, x.retained / hireMax * 82)}%` }} />
                    <ChartTip className={`bottom-7 ${index === 0 ? "left-0" : index === months.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                      <strong className="block">{x.label}</strong>{x.joined} tuyển mới · {x.retained} còn hoạt động
                    </ChartTip>
                    <span className="absolute -bottom-6 text-[11px] font-medium text-slate-500 sm:text-xs">{x.label}</span>
                  </div>)}
                </div>
              </div>
              <div className="mt-10 flex justify-center gap-5 text-xs text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-brand-600" />Tuyển mới</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Còn hoạt động</span></div>
            </div>
          </Panel>

          <Panel title="Mức phủ thông tin" subtitle="Các trường hồ sơ cần HR theo dõi định kỳ" icon={BadgeCheck}>
            <div className="space-y-5 p-5">{coverage.map((x) => <div key={x.key}>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="text-slate-600">{x.label}</span><span className="font-semibold text-slate-950">{x.percent}%</span></div>
              <div tabIndex={0} className="group relative flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`${x.label}: ${x.count} trên ${filtered.length}, đạt ${x.percent}%`}>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${x.percent}%` }} /></div><span className="w-12 text-right text-xs text-slate-500">{x.count}/{filtered.length}</span>
                <ChartTip className="right-0 top-4">{x.label}: {x.count}/{filtered.length} hồ sơ · {x.percent}%</ChartTip>
              </div>
            </div>)}</div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Sinh nhật 30 ngày" subtitle="Nhân sự có ngày sinh sắp tới" icon={CalendarDays}>
            <div className="p-4">{birthdays.length ? <div className="space-y-2">{birthdays.map(({ item, days }) => <Link key={item.id} href={`/nhan-vien/${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/50">
              <Avatar name={item.name} color={avatarColor(item.name)} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{days === 0 ? "Hôm nay" : `Còn ${days} ngày`}</p></div>
            </Link>)}</div> : <Empty>Không có sinh nhật sắp tới.</Empty>}</div>
          </Panel>
          <Panel title="Mốc thử việc" subtitle="Nhân sự đang hoạt động và làm việc dưới 3 tháng" icon={UserCheck}>
            <div className="p-4">{probation.length ? <div className="space-y-2">{probation.map((item) => <Link key={item.id} href={`/nhan-vien/${item.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/50">
              <Avatar name={item.name} color={avatarColor(item.name)} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">Đã làm việc {tenure(monthsAtCompany(item.startDate))}</p></div>
            </Link>)}</div> : <Empty>Không có mốc thử việc gần hạn.</Empty>}</div>
          </Panel>
          <Panel title="Hồ sơ cần bổ sung" subtitle="Ưu tiên nhân sự thiếu nhiều trường dữ liệu" icon={ContactRound}>
            <div className="max-h-80 space-y-2 overflow-y-auto p-4">{missingPeople.length ? missingPeople.slice(0, 6).map(({ item, fields }) => <Link key={item.id} href={`/nhan-vien/${item.id}`} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
              <Avatar name={item.name} color={avatarColor(item.name)} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-950">{item.name}</p><span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-600">{fields.length} thiếu</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{fields.join(", ")}</p></div>
            </Link>) : <Empty>Tất cả hồ sơ đã đầy đủ.</Empty>}</div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Top chức vụ" subtitle="Nhóm chức vụ có nhiều nhân sự nhất" icon={BriefcaseBusiness} className="lg:col-span-2">
            <div className="space-y-4 p-5">{positionStats.length ? positionStats.map((x, i) => <div key={x.position} tabIndex={0} className="group relative grid grid-cols-[minmax(90px,160px)_1fr_32px] items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`${x.position}: ${x.count} nhân sự`}>
              <span className="truncate text-sm font-medium text-slate-600" title={x.position}>{x.position}</span><div className="h-10 overflow-hidden rounded-r-lg bg-slate-50"><div className="h-full rounded-r-lg transition-all duration-700 group-hover:brightness-95" style={{ width: `${Math.max(8, x.count / positionMax * 100)}%`, background: COLORS[i % COLORS.length] }} /></div><strong className="text-right text-sm">{x.count}</strong>
              <ChartTip className="right-10 top-1/2 -translate-y-1/2">{x.position}: {x.count} nhân sự</ChartTip>
            </div>) : <Empty>Chưa có dữ liệu chức vụ.</Empty>}</div>
          </Panel>
          <Panel title="Sức khỏe phòng ban" subtitle="Tổng nhân sự và mức hoàn thiện hồ sơ" icon={ShieldCheck}>
            <div className="max-h-[420px] space-y-3 overflow-y-auto p-4">{deptStats.length ? deptStats.map((x) => {
              const completion = Math.round(x.people.reduce((sum, p) => sum + FIELDS.length - missing(p).length, 0) / (x.people.length * FIELDS.length) * 100);
              const average = Math.round(x.people.reduce((sum, p) => sum + monthsAtCompany(p.startDate), 0) / x.people.length);
              return <button key={x.id} type="button" onClick={() => setDepartment(x.id)} className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-200 hover:shadow-sm">
                <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{x.name}</strong><span className={`rounded-full px-2.5 py-1 text-xs ${completion >= 80 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{completion}%</span></div>
                <p className="mt-1 text-xs text-slate-500">{x.active} hoạt động · thâm niên TB {tenure(average)}</p>
                <div className="group relative mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${completion}%` }} /></div><span className="text-xs text-slate-500">{x.people.length} NV</span>
                  <ChartTip className="bottom-4 right-0">{completion}% hồ sơ hoàn thiện · {x.people.length} nhân sự</ChartTip>
                </div>
              </button>;
            }) : <Empty>Chưa có dữ liệu phòng ban.</Empty>}</div>
          </Panel>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Thiếu điện thoại" value={filtered.filter((x) => !x.phone).length} note="Cần bổ sung để liên hệ khẩn" icon={PhoneOff} tone="rose" />
          <StatCard label="Thiếu ngân hàng" value={filtered.filter((x) => !x.bankAccount || !x.bankName).length} note="Phục vụ đồng bộ lương" icon={Banknote} tone="amber" />
          <StatCard label="Kênh thông báo" value={filtered.filter((x) => x.email).length} note="Hồ sơ đã có địa chỉ email" icon={MailCheck} tone="blue" />
          <StatCard label="Tài khoản khóa" value={filtered.filter((x) => x.status === "inactive").length} note="Trạng thái tài khoản đang tạm ngưng" icon={ShieldCheck} tone="blue" onClick={() => setStatus("inactive")} />
          <StatCard label="Nghỉ việc" value={filtered.filter((x) => x.endDate).length} note="Hồ sơ đã có ngày nghỉ việc" icon={CircleUserRound} tone="blue" />
        </div>
        <div className="flex justify-end"><Link href="/nhan-vien" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-600"><UserPlus className="h-4 w-4" /> Quản lý hồ sơ nhân sự</Link></div>
      </div>
    </div>
  );
}
