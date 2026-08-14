"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  ArrowDownUp, ArrowLeft, Building2, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Download, Eye, FileUp, FilterX, LockKeyhole,
  Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UnlockKeyhole, UsersRound, X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { Button } from "@/components/ui/Button";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { accountService } from "@/services/account-service";
import { getErrorMessage } from "@/lib/errors";
import { exportTablePdf } from "@/lib/pdf-export";
import { cn } from "@/lib/utils";
import type { AccountInput, AccountListSummary, AccountPage, Department, EmployeeAccount } from "@/types/account";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";

const AccountFormModal = dynamic(
  () => import("@/components/accounts/AccountFormModal").then((mod) => mod.AccountFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

const ROLE_LABEL = { admin: "Quản trị", manager: "Quản lý", member: "Nhân viên" };
const PAGE_SIZES = [20, 50, 100];
const DEPARTMENT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#ef4444"];
type SortKey = "employeeCode" | "name" | "username" | "startDate" | "createdAt";
const EMPTY_SUMMARY: AccountListSummary = {
  total: 0, active: 0, admins: 0, positions: [], departments: [],
};
const EMPTY_ACCOUNTS: EmployeeAccount[] = [];
const EMPTY_DEPARTMENTS: Department[] = [];
const EMPTY_ACCOUNT_PAGE: AccountPage = {
  items: EMPTY_ACCOUNTS, total: 0, departments: EMPTY_DEPARTMENTS, summary: EMPTY_SUMMARY,
};

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function avatarColor(name: string) {
  const colors = ["#2563eb", "#7c3aed", "#e11d48", "#ea580c", "#059669", "#0891b2"];
  return colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

interface AccountFilterState {
  search: string;
  department: string;
  position: string;
  role: string;
  status: string;
}

function matchesAccountFilters(account: EmployeeAccount, filters: AccountFilterState): boolean {
  const term = filters.search.trim().toLocaleLowerCase();
  if (term) {
    const haystack = [account.name, account.employeeCode, account.email, account.username, account.phone]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (filters.department && account.departmentId !== filters.department) return false;
  if (filters.position && account.position !== filters.position) return false;
  if (filters.role && account.role !== filters.role) return false;
  if (filters.status && account.status !== filters.status) return false;
  return true;
}

// Trang nhân viên hiển thị thống kê tổng (summary) không phụ thuộc bộ lọc hiện tại,
// nên mỗi lần thêm/sửa/xóa cần cộng/trừ đúng phần đóng góp của bản ghi cũ và mới
// thay vì gọi lại API để tránh phải tải lại toàn bộ danh sách.
function summaryDelta(summary: AccountListSummary, account: EmployeeAccount, sign: 1 | -1): AccountListSummary {
  return {
    ...summary,
    total: Math.max(0, summary.total + sign),
    active: account.status === "active" ? Math.max(0, summary.active + sign) : summary.active,
    admins: account.role === "admin" ? Math.max(0, summary.admins + sign) : summary.admins,
    departments: summary.departments.map((item) =>
      item.id === account.departmentId ? { ...item, count: Math.max(0, item.count + sign) } : item
    ),
  };
}

function adjustSummary(summary: AccountListSummary, removed?: EmployeeAccount, added?: EmployeeAccount): AccountListSummary {
  let next = summary;
  if (removed) next = summaryDelta(next, removed, -1);
  if (added) next = summaryDelta(next, added, 1);
  return next;
}

export function AccountManagementPage() {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const cache = useSessionDataCache();
  const { account: currentAccount } = useCurrentAccount();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "createdAt", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<EmployeeAccount | "new" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accountsKey = currentAccount
    ? buildCacheKey({
        accountId: currentAccount.id,
        role: currentAccount.role,
        resource: CACHE_RESOURCE.accountsList,
        filters: { search, department, position, role, status, sort: sort.key, direction: sort.direction },
        page,
        pageSize,
      })
    : null;

  const {
    data: accountPage,
    status: queryStatus,
    isRevalidating,
    error: listError,
    refresh: refreshAccounts,
    setData: setAccountPage,
  } = useSessionQuery<AccountPage>({
    key: accountsKey,
    fetcher: (signal) => accountService.getPage({
      search, departmentId: department, position,
      role: role as EmployeeAccount["role"] || undefined,
      status: status as EmployeeAccount["status"] || undefined,
      sort: sort.key,
      direction: sort.direction, page, pageSize,
    }, { signal }),
    ttl: CACHE_TTL.list,
  });

  const accounts = accountPage?.items ?? EMPTY_ACCOUNTS;
  const departments = accountPage?.departments ?? EMPTY_DEPARTMENTS;
  const total = accountPage?.total ?? 0;
  const summary = accountPage?.summary ?? EMPTY_SUMMARY;
  const loading = queryStatus === "loading";

  useEffect(() => {
    if (!listError) return;
    notify({ type: "error", title: "Không thể tải tài khoản", description: getErrorMessage(listError, "Vui lòng thử lại.") });
  }, [listError, notify]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    // Bộ lọc thay đổi thì quay về trang đầu và bỏ chọn dòng cũ để không rơi vào trang trống.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setSelected([]);
  }, [search, department, position, role, status, sort, pageSize]);
  useEffect(() => {
    // Đổi trang cũng bỏ chọn dòng cũ (trang mới không còn các dòng đã chọn).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected([]);
  }, [page]);

  const positions = summary.positions;
  const statistics = useMemo(() => {
    const countByDepartment = new Map(summary.departments.map((item) => [item.id, item.count]));
    const departmentStats = departments
      .map((item, index) => ({
        id: item.id,
        name: item.name,
        count: countByDepartment.get(item.id) ?? 0,
        color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
      }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "vi"));

    return {
      activeCount: summary.active,
      adminCount: summary.admins,
      departmentStats,
      assignedCount: departmentStats.reduce((total, item) => total + item.count, 0),
    };
  }, [departments, summary]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visible = accounts;
  const activeFilters = [department, position, role, status].filter(Boolean).length;

  function toggleSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  async function save(input: AccountInput) {
    const existing = editing && editing !== "new" ? editing : undefined;
    const saved = existing
      ? await accountService.update(existing.id, input)
      : await accountService.create(input);
    if (!saved) throw new Error("Không thể lưu tài khoản.");

    const filters: AccountFilterState = { search, department, position, role, status };
    const isVisible = matchesAccountFilters(saved, filters);
    const wasVisible = existing ? matchesAccountFilters(existing, filters) : false;

    setAccountPage((previous) => {
      const base = previous ?? EMPTY_ACCOUNT_PAGE;
      const exists = base.items.some((account) => account.id === saved.id);
      const items = !isVisible
        ? base.items.filter((account) => account.id !== saved.id)
        : exists
          ? base.items.map((account) => account.id === saved.id ? saved : account)
          : !existing && page === 1 ? [saved, ...base.items].slice(0, pageSize) : base.items;
      const total = wasVisible === isVisible ? base.total : Math.max(0, base.total + (isVisible ? 1 : -1));
      return { ...base, items, total, summary: adjustSummary(base.summary, existing, saved) };
    });

    notify({ type: "success", title: editing === "new" ? "Đã thêm tài khoản" : "Đã cập nhật tài khoản" });
    setEditing(null);
    // Tên/chức vụ/trạng thái tài khoản nằm trong ACCOUNT_SELECT của listDirectory()
    // (chỉ lấy tài khoản status=active) — xóa cache để dropdown ở 3 trang danh sách
    // công việc/dự án/task không hiển thị tên/chức vụ cũ hoặc tài khoản vừa khóa.
    cache.invalidate(CACHE_RESOURCE.directoryMembers);
  }

  async function openEdit(accountId: string) {
    try {
      const account = await accountService.getById(accountId);
      setEditing(account);
    } catch (error) {
      notify({ type: "error", title: "Không thể tải hồ sơ", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function remove(account: EmployeeAccount) {
    const ok = await confirm({
      title: `Xóa tài khoản ${account.name}?`,
      description: "Hồ sơ nhân viên sẽ bị xóa khỏi hệ thống. Các liên kết công việc sẽ được gỡ người phụ trách.",
      confirmLabel: "Xóa tài khoản",
    });
    if (!ok) return;
    try {
      await accountService.delete(account.id);
      setAccountPage((previous) => {
        const base = previous ?? EMPTY_ACCOUNT_PAGE;
        return {
          ...base,
          items: base.items.filter((item) => item.id !== account.id),
          total: Math.max(0, base.total - 1),
          summary: adjustSummary(base.summary, account),
        };
      });
      setSelected((current) => current.filter((id) => id !== account.id));
      notify({ type: "success", title: "Đã xóa tài khoản" });
      cache.invalidate(CACHE_RESOURCE.directoryMembers);
    } catch (error) {
      notify({ type: "error", title: "Không thể xóa", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function toggleStatus(account: EmployeeAccount) {
    try {
      const saved = await accountService.updateStatus(account.id, account.status === "active" ? "inactive" : "active");
      if (!saved) throw new Error("Không tìm thấy tài khoản.");
      const filters: AccountFilterState = { search, department, position, role, status };
      const isVisible = matchesAccountFilters(saved, filters);
      setAccountPage((previous) => {
        const base = previous ?? EMPTY_ACCOUNT_PAGE;
        const mapped = base.items.map((item) => item.id === saved.id ? saved : item);
        const items = isVisible ? mapped : mapped.filter((item) => item.id !== saved.id);
        return {
          ...base,
          items,
          total: isVisible ? base.total : Math.max(0, base.total - 1),
          summary: adjustSummary(base.summary, account, saved),
        };
      });
      notify({ type: "success", title: account.status === "active" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản" });
      cache.invalidate(CACHE_RESOURCE.directoryMembers);
    } catch (error) {
      notify({ type: "error", title: "Không thể cập nhật trạng thái", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function bulkStatus(nextStatus: "active" | "inactive") {
    const targets = accounts.filter((item) => selected.includes(item.id));
    try {
      const savedAccounts = await accountService.updateStatusBatch(targets.map((item) => item.id), nextStatus);
      const savedById = new Map(savedAccounts.map((account) => [account.id, account]));
      if (savedById.size !== targets.length) throw new Error("Không thể cập nhật toàn bộ tài khoản đã chọn.");
      const filters: AccountFilterState = { search, department, position, role, status };
      setAccountPage((previous) => {
        const base = previous ?? EMPTY_ACCOUNT_PAGE;
        const mapped = base.items.map((item) => savedById.get(item.id) ?? item);
        const filtered = mapped.filter((item) => matchesAccountFilters(item, filters));
        return {
          ...base,
          items: filtered,
          total: Math.max(0, base.total - (mapped.length - filtered.length)),
          summary: targets.reduce((acc, target) => adjustSummary(acc, target, savedById.get(target.id)), base.summary),
        };
      });
      setSelected([]);
      notify({ type: "success", title: nextStatus === "active" ? "Đã mở khóa các tài khoản" : "Đã khóa các tài khoản" });
      cache.invalidate(CACHE_RESOURCE.directoryMembers);
    } catch (error) {
      notify({ type: "error", title: "Thao tác hàng loạt chưa hoàn tất", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function exportPdf() {
    try {
      const first = await accountService.getPage({
        search, departmentId: department, position,
        role: role as EmployeeAccount["role"] || undefined,
        status: status as EmployeeAccount["status"] || undefined,
        sort: sort.key,
        direction: sort.direction, page: 1, pageSize: 100,
      });
      const pages = Math.ceil(first.total / 100);
      const rest = pages > 1
        ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => accountService.getPage({
            search, departmentId: department, position,
            role: role as EmployeeAccount["role"] || undefined,
            status: status as EmployeeAccount["status"] || undefined,
            sort: sort.key,
            direction: sort.direction, page: index + 2, pageSize: 100,
          })))
        : [];
      const exportAccounts = [first, ...rest].flatMap((result) => result.items);
      await exportTablePdf({
        title: "Danh sách tài khoản nhân viên",
        filename: `tai-khoan-${new Date().toISOString().slice(0,10)}.pdf`,
        orientation: "landscape",
        columns: [
          { label: "Mã NV", width: 42 }, { label: "Họ tên", width: "*" },
          { label: "Email", width: "*" }, { label: "Phòng ban", width: 70 },
          { label: "Chức vụ", width: 65 }, { label: "Vai trò", width: 48 },
          { label: "Trạng thái", width: 52 }, { label: "SĐT", width: 58 },
          { label: "Ngày vào", width: 50, alignment: "center" },
        ],
        rows: exportAccounts.map((account) => [
          account.employeeCode, account.name, account.email, account.department?.name,
          account.position, ROLE_LABEL[account.role], account.status === "active" ? "Hoạt động" : "Đã khóa",
          account.phone, formatDate(account.startDate),
        ]),
      });
      notify({ type: "success", title: `Đã xuất ${exportAccounts.length} tài khoản ra PDF` });
    } catch (error) {
      notify({ type: "error", title: "Không thể xuất PDF", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("Tệp CSV không có dữ liệu.");
      const parse = (line: string) => line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((cell) => cell.replace(/^"|"$/g, "").replaceAll('""', '"').trim()) ?? [];
      const headers = parse(lines[0]).map((item) => item.toLowerCase());
      const value = (row: string[], names: string[]) => {
        const index = headers.findIndex((header) => names.includes(header));
        return index >= 0 ? row[index] : "";
      };
      const inputs: AccountInput[] = [];
      for (const line of lines.slice(1)) {
        const row = parse(line);
        const employeeCode = value(row, ["mã nv", "ma nv", "employee code"]);
        const name = value(row, ["họ tên", "ho ten", "nhân viên", "name"]);
        if (!employeeCode || !name) continue;
        inputs.push({
          employeeCode, name,
          email: value(row, ["email"]) || undefined,
          username: value(row, ["tên đăng nhập", "ten dang nhap", "username"]) || undefined,
          phone: value(row, ["sđt", "sdt", "phone"]) || undefined,
          role: "member", status: "active",
        });
      }
      if (inputs.length === 0) throw new Error("Tệp CSV không có dòng tài khoản hợp lệ.");
      if (inputs.length > 100) throw new Error("Mỗi lần chỉ có thể nhập tối đa 100 tài khoản.");
      const created = await accountService.createBatch(inputs);
      const filters: AccountFilterState = { search, department, position, role, status };
      const visibleCreated = created.filter((account) => matchesAccountFilters(account, filters));
      setAccountPage((previous) => {
        const base = previous ?? EMPTY_ACCOUNT_PAGE;
        const items = page === 1 && visibleCreated.length > 0
          ? [...visibleCreated, ...base.items].slice(0, pageSize)
          : base.items;
        return {
          ...base,
          items,
          total: base.total + visibleCreated.length,
          summary: created.reduce((acc, account) => adjustSummary(acc, undefined, account), base.summary),
        };
      });
      notify({ type: "success", title: `Đã nhập ${created.length} tài khoản` });
      if (created.length > 0) cache.invalidate(CACHE_RESOURCE.directoryMembers);
    } catch (error) {
      notify({ type: "error", title: "Không thể nhập CSV", description: getErrorMessage(error, "Tệp CSV không hợp lệ.") });
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.includes(item.id));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="flex items-center gap-2 font-bold text-gray-900"><UsersRound className="h-4 w-4 text-brand-600" /> {summary.total} nhân viên</span>
          <span className="text-gray-500"><b>{statistics.activeCount}</b> hoạt động · <b>{summary.total - statistics.activeCount}</b> khóa</span>
          <span className="text-gray-500"><b>{statistics.adminCount}</b> quản trị · <b>{summary.total - statistics.adminCount}</b> nhân viên</span>
        </div>
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((current) => !current)}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-brand-600"
        >
          Chi tiết <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
        </button>
      </div>

      {showDetails && (
        <section className="shrink-0 space-y-3 border-b border-gray-200 bg-white px-4 py-3" aria-label="Thống kê tài khoản">
          <div className="grid gap-2.5 md:grid-cols-3">
            <StatisticsCard
              icon={UsersRound}
              iconClassName="bg-brand-600 text-white"
              value={summary.total}
              label="Tổng nhân viên"
              description={`${statistics.activeCount} hoạt động`}
            />
            <StatisticsCard
              icon={ShieldCheck}
              iconClassName="bg-violet-500 text-white"
              value={statistics.adminCount}
              label="Quản trị viên"
            />
            <StatisticsCard
              icon={Building2}
              iconClassName="bg-emerald-500 text-white"
              value={statistics.departmentStats.length}
              label="Phòng ban"
              description={statistics.departmentStats[0]?.name ?? "Chưa có dữ liệu"}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Building2 className="h-3.5 w-3.5" /> Phòng ban
            </div>
            {statistics.assignedCount > 0 ? (
              <>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  {statistics.departmentStats.map((item) => (
                    <div
                      key={item.id}
                      title={`${item.name}: ${item.count}`}
                      className="h-full border-r border-white last:border-r-0"
                      style={{ width: `${(item.count / statistics.assignedCount) * 100}%`, backgroundColor: item.color }}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
                  {statistics.departmentStats.map((item) => (
                    <span key={item.id} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}: <b>{item.count}</b>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">Chưa có nhân viên thuộc phòng ban.</p>
            )}
          </div>
        </section>
      )}

      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-2 py-2">
        <button type="button" onClick={() => history.back()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="relative min-w-[180px] flex-1 xl:max-w-[470px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Tìm theo tên, mã NV, email..." className="h-9 w-full rounded-xl border border-gray-200 pl-9 pr-9 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          {searchInput && <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-4 w-4" /></button>}
        </div>
        <Filter value={department} onChange={setDepartment} label="Phòng ban" options={departments.map((item) => ({ value: item.id, label: item.name }))} />
        <Filter value={position} onChange={setPosition} label="Chức vụ" options={positions.map((item) => ({ value: item, label: item }))} />
        <Filter value={role} onChange={setRole} label="Vai trò" options={Object.entries(ROLE_LABEL).map(([value,label]) => ({ value, label }))} />
        <Filter value={status} onChange={setStatus} label="Trạng thái" count={status ? 1 : 0} options={[{ value:"active",label:"Hoạt động" },{ value:"inactive",label:"Đã khóa" }]} />
        {activeFilters > 0 && <button title="Xóa bộ lọc" onClick={() => { setDepartment(""); setPosition(""); setRole(""); setStatus(""); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><FilterX className="h-4 w-4" /></button>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {selected.length > 0 && <>
            <span className="text-xs font-medium text-brand-600">{selected.length} đã chọn</span>
            <button title="Mở khóa" onClick={() => void bulkStatus("active")} className="icon-button"><UnlockKeyhole className="h-4 w-4" /></button>
            <button title="Khóa" onClick={() => void bulkStatus("inactive")} className="icon-button"><LockKeyhole className="h-4 w-4" /></button>
          </>}
          <Button size="sm" onClick={() => setEditing("new")} className="h-9 whitespace-nowrap"><Plus className="h-4 w-4" /> Thêm mới</Button>
          <button title="Tải lại" onClick={refreshAccounts} className="icon-button"><RefreshCw className={cn("h-4 w-4", (loading || isRevalidating) && "animate-spin")} /></button>
          <button title="Nhập CSV" onClick={() => fileRef.current?.click()} className="icon-button"><FileUp className="h-4 w-4" /></button>
          <button title="Xuất PDF" onClick={() => void exportPdf()} className="icon-button"><Download className="h-4 w-4" /></button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void importCsv(e)} />
        </div>
      </div>

      <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1680px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold text-gray-700">
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-20 w-12 bg-gray-50 px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...current, ...visible.map((a) => a.id)])])} /></th>
              <SortTh label="Mã NV" column="employeeCode" sort={sort} onSort={toggleSort} width="150px" />
              <SortTh label="Nhân viên" column="name" sort={sort} onSort={toggleSort} width="285px" />
              <SortTh label="Tên đăng nhập" column="username" sort={sort} onSort={toggleSort} width="190px" />
              <th className="min-w-[180px] px-4 py-3">Phòng ban</th><th className="min-w-[185px] px-4 py-3">Chức vụ</th><th className="min-w-[115px] px-4 py-3">Vai trò</th><th className="min-w-[125px] px-4 py-3">Trạng thái</th>
              <th className="min-w-[135px] px-4 py-3">SĐT</th>
              <SortTh label="Ngày vào làm" column="startDate" sort={sort} onSort={toggleSort} />
              <SortTh label="Ngày tạo" column="createdAt" sort={sort} onSort={toggleSort} />
              <th className="sticky right-0 z-20 min-w-[180px] border-l border-gray-200 bg-gray-50 px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows /> : visible.length === 0 ? (
              <tr><td colSpan={12} className="py-24 text-center text-gray-400">Không tìm thấy tài khoản phù hợp.</td></tr>
            ) : visible.map((account) => (
              <tr key={account.id} className="data-table-row group border-b border-gray-200">
                <td className="sticky left-0 z-[2] px-4 py-3"><input type="checkbox" checked={selected.includes(account.id)} onChange={() => setSelected((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])} /></td>
                <td className="px-4 py-3 font-medium text-gray-600">{account.employeeCode}</td>
                <td className="px-4 py-2.5"><button onClick={() => router.push(`/nhan-vien/${account.id}`)} className="flex items-center gap-3 text-left hover:text-brand-600">
                  {account.avatarUrl ? (
                    <Image
                      src={account.avatarUrl}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-100"
                    />
                  ) : <Avatar name={account.name} color={avatarColor(account.name)} size="md" />}
                  <span><b className="block max-w-[190px] truncate text-gray-900">{account.name}</b><span className="block max-w-[190px] truncate text-xs text-gray-500">{account.email ?? "—"}</span></span>
                </button></td>
                <td className="px-4 py-3 font-semibold text-gray-900">{account.username ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{account.department?.name ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{account.position ?? "—"}</td>
                <td className="px-4 py-3"><span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", account.role === "admin" ? "border-brand-600 bg-brand-600 text-white" : account.role === "manager" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-700")}>{ROLE_LABEL[account.role]}</span></td>
                <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", account.status === "active" ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-600")}>{account.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td>
                <td className="px-4 py-3">{account.phone ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(account.startDate)}</td><td className="px-4 py-3">{formatDate(account.createdAt)}</td>
                <td
                  className="sticky right-0 z-[2] border-l border-gray-100 px-4 py-3"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <ActionIconButton icon={Eye} label="Xem chi tiết" onClick={() => router.push(`/nhan-vien/${account.id}`)} />
                    <ActionIconButton icon={Pencil} label="Chỉnh sửa" tone="warning" onClick={() => void openEdit(account.id)} />
                    <ActionIconButton
                      icon={account.status === "active" ? LockKeyhole : UnlockKeyhole}
                      label={account.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      onClick={() => void toggleStatus(account)}
                    />
                    <ActionIconButton icon={Trash2} label="Xóa tài khoản" tone="danger" onClick={() => void remove(account)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2.5 text-sm">
        <div className="flex items-center gap-3 text-gray-600"><span>Tổng: <b>{total}</b> bản ghi</span><span>Hiển thị</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 px-2 outline-none">{PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select><span>/ trang</span>
        </div>
        <div className="flex items-center gap-1">
          <PageButton onClick={() => setPage(1)} disabled={page <= 1} icon={ChevronsLeft} />
          <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} icon={ChevronLeft} />
          <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-600 px-3 font-semibold text-white">{Math.min(page, pageCount)}</span><span className="px-1 text-gray-600">/ {pageCount}</span>
          <PageButton onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} icon={ChevronRight} />
          <PageButton onClick={() => setPage(pageCount)} disabled={page >= pageCount} icon={ChevronsRight} />
        </div>
      </div>

      {editing && <AccountFormModal account={editing === "new" ? undefined : editing} departments={departments} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function Filter({ value, onChange, label, options, count }: { value: string; onChange: (value: string) => void; label: string; options: { value: string; label: string }[]; count?: number }) {
  return <label className="relative w-[112px] shrink-0"><select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 w-full appearance-none truncate rounded-xl border bg-white pl-8 pr-7 text-xs outline-none hover:bg-gray-50 focus:ring-2 focus:ring-brand-100", value ? "border-brand-400 text-brand-600" : "border-gray-200 text-gray-600")}><option value="">{label}</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ArrowDownUp className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />{count ? <span className="pointer-events-none absolute right-6 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">{count}</span> : <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />}</label>;
}

function StatisticsCard({ icon: Icon, iconClassName, value, label, description }: {
  icon: React.ElementType;
  iconClassName: string;
  value: number;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClassName)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <b className="block text-lg leading-5 text-gray-950">{value}</b>
        <span className="block text-xs font-medium text-gray-600">{label}</span>
        {description && <span className="block truncate text-[11px] text-gray-400">{description}</span>}
      </span>
    </div>
  );
}

function SortTh({ label, column, sort, onSort, width }: { label: string; column: SortKey; sort: { key: SortKey; direction: string }; onSort: (key: SortKey) => void; width?: string }) {
  return <th style={{ minWidth: width }} className="px-4 py-3"><button onClick={() => onSort(column)} className="flex items-center gap-2 hover:text-brand-600">{label}<ArrowDownUp className={cn("h-3.5 w-3.5", sort.key === column && "text-brand-600")} /></button></th>;
}

function PageButton({ icon: Icon, ...props }: { icon: React.ElementType } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Icon className="h-4 w-4" /></button>;
}

function LoadingRows() {
  return <>{[1,2,3,4,5].map((row) => <tr key={row} className="border-b border-gray-100"><td colSpan={16} className="px-4 py-3"><div className="h-9 animate-pulse rounded-lg bg-gray-100" /></td></tr>)}</>;
}
