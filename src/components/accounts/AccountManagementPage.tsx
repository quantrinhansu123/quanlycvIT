"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Download, Eye, FileUp, FilterX, LockKeyhole,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, UnlockKeyhole, UsersRound, X,
} from "lucide-react";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { accountService } from "@/services/account-service";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { AccountInput, Department, EmployeeAccount } from "@/types/account";

const ROLE_LABEL = { admin: "Quản trị", manager: "Quản lý", member: "Nhân viên" };
const PAGE_SIZES = [20, 50, 100];
type SortKey = "employeeCode" | "name" | "username" | "birthDate" | "startDate" | "createdAt";

function asInput(account: EmployeeAccount): AccountInput {
  const { employeeCode, name, phone, address, avatarUrl, birthDate, startDate, endDate,
    bankAccount, bankName, note, username, email, departmentId, position, role, status } = account;
  return { employeeCode, name, phone, address, avatarUrl, birthDate, startDate, endDate,
    bankAccount, bankName, note, username, email, departmentId, position, role, status };
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function avatarColor(name: string) {
  const colors = ["#2563eb", "#7c3aed", "#e11d48", "#ea580c", "#059669", "#0891b2"];
  return colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

function csvCell(value?: string) {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

export function AccountManagementPage() {
  const { notify, confirm } = useFeedback();
  const router = useRouter();
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [menuId, setMenuId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await accountService.getAll();
      setAccounts(result.accounts);
      setDepartments(result.departments);
    } catch (error) {
      notify({ type: "error", title: "Không thể tải tài khoản", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Lần tải đầu tiên đồng bộ dữ liệu từ Supabase vào màn hình.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Bộ lọc thay đổi thì quay về trang đầu để không rơi vào trang trống.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, department, position, role, status, pageSize]);
  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const positions = useMemo(() => [...new Set(accounts.map((item) => item.position).filter(Boolean) as string[])].sort(), [accounts]);
  const filtered = useMemo(() => {
    const keyword = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return accounts.filter((account) => {
      const haystack = [account.employeeCode, account.name, account.email, account.username, account.phone].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return (!keyword || haystack.includes(keyword))
        && (!department || account.departmentId === department)
        && (!position || account.position === position)
        && (!role || account.role === role)
        && (!status || account.status === status);
    }).sort((a, b) => {
      const left = a[sort.key] ?? "";
      const right = b[sort.key] ?? "";
      return String(left).localeCompare(String(right), "vi", { numeric: true }) * (sort.direction === "asc" ? 1 : -1);
    });
  }, [accounts, department, position, role, search, sort, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const activeFilters = [department, position, role, status].filter(Boolean).length;

  function toggleSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  async function save(input: AccountInput) {
    if (editing && editing !== "new") await accountService.update(editing.id, input);
    else await accountService.create(input);
    notify({ type: "success", title: editing === "new" ? "Đã thêm tài khoản" : "Đã cập nhật tài khoản" });
    setEditing(null);
    await load();
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
      setSelected((current) => current.filter((id) => id !== account.id));
      notify({ type: "success", title: "Đã xóa tài khoản" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể xóa", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function toggleStatus(account: EmployeeAccount) {
    try {
      await accountService.update(account.id, { ...asInput(account), status: account.status === "active" ? "inactive" : "active" });
      notify({ type: "success", title: account.status === "active" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể cập nhật trạng thái", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  async function bulkStatus(nextStatus: "active" | "inactive") {
    const targets = accounts.filter((item) => selected.includes(item.id));
    try {
      await Promise.all(targets.map((item) => accountService.update(item.id, { ...asInput(item), status: nextStatus })));
      setSelected([]);
      notify({ type: "success", title: nextStatus === "active" ? "Đã mở khóa các tài khoản" : "Đã khóa các tài khoản" });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Thao tác hàng loạt chưa hoàn tất", description: getErrorMessage(error, "Vui lòng thử lại.") });
    }
  }

  function exportCsv() {
    const headers = ["Mã NV","Họ tên","Email","Tên đăng nhập","Phòng ban","Chức vụ","Vai trò","Trạng thái","SĐT","STK","Ngân hàng","Địa chỉ","Ngày sinh","Ngày vào làm","Ngày tạo"];
    const rows = filtered.map((a) => [a.employeeCode,a.name,a.email,a.username,a.department?.name,a.position,ROLE_LABEL[a.role],a.status === "active" ? "Hoạt động" : "Đã khóa",a.phone,a.bankAccount,a.bankName,a.address,a.birthDate,a.startDate,a.createdAt.slice(0,10)].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF" + [headers.map(csvCell).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tai-khoan-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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
      let imported = 0;
      for (const line of lines.slice(1)) {
        const row = parse(line);
        const employeeCode = value(row, ["mã nv", "ma nv", "employee code"]);
        const name = value(row, ["họ tên", "ho ten", "nhân viên", "name"]);
        if (!employeeCode || !name) continue;
        await accountService.create({
          employeeCode, name,
          email: value(row, ["email"]) || undefined,
          username: value(row, ["tên đăng nhập", "ten dang nhap", "username"]) || undefined,
          phone: value(row, ["sđt", "sdt", "phone"]) || undefined,
          role: "member", status: "active",
        });
        imported++;
      }
      notify({ type: "success", title: `Đã nhập ${imported} tài khoản` });
      await load();
    } catch (error) {
      notify({ type: "error", title: "Không thể nhập CSV", description: getErrorMessage(error, "Tệp CSV không hợp lệ.") });
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.includes(item.id));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="flex items-center gap-2 font-bold text-gray-900"><UsersRound className="h-4 w-4 text-blue-600" /> {accounts.length} nhân viên</span>
          <span className="text-gray-500"><b>{accounts.filter((a) => a.status === "active").length}</b> hoạt động · <b>{accounts.filter((a) => a.status === "inactive").length}</b> khóa</span>
          <span className="text-gray-500"><b>{accounts.filter((a) => a.role === "admin").length}</b> quản trị · <b>{accounts.filter((a) => a.role !== "admin").length}</b> nhân viên</span>
        </div>
        <button className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-blue-600">Chi tiết <ChevronDown className="h-3.5 w-3.5" /></button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-100 px-2 py-2">
        <button type="button" onClick={() => history.back()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="relative min-w-[180px] flex-1 xl:max-w-[470px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mã NV, email..." className="h-9 w-full rounded-xl border border-gray-200 pl-9 pr-9 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-4 w-4" /></button>}
        </div>
        <Filter value={department} onChange={setDepartment} label="Phòng ban" options={departments.map((item) => ({ value: item.id, label: item.name }))} />
        <Filter value={position} onChange={setPosition} label="Chức vụ" options={positions.map((item) => ({ value: item, label: item }))} />
        <Filter value={role} onChange={setRole} label="Vai trò" options={Object.entries(ROLE_LABEL).map(([value,label]) => ({ value, label }))} />
        <Filter value={status} onChange={setStatus} label="Trạng thái" count={status ? 1 : 0} options={[{ value:"active",label:"Hoạt động" },{ value:"inactive",label:"Đã khóa" }]} />
        {activeFilters > 0 && <button title="Xóa bộ lọc" onClick={() => { setDepartment(""); setPosition(""); setRole(""); setStatus(""); }} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><FilterX className="h-4 w-4" /></button>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {selected.length > 0 && <>
            <span className="text-xs font-medium text-blue-600">{selected.length} đã chọn</span>
            <button title="Mở khóa" onClick={() => void bulkStatus("active")} className="icon-button"><UnlockKeyhole className="h-4 w-4" /></button>
            <button title="Khóa" onClick={() => void bulkStatus("inactive")} className="icon-button"><LockKeyhole className="h-4 w-4" /></button>
          </>}
          <Button size="sm" onClick={() => setEditing("new")} className="h-9 whitespace-nowrap"><Plus className="h-4 w-4" /> Thêm mới</Button>
          <button title="Tải lại" onClick={() => void load()} className="icon-button"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></button>
          <button title="Nhập CSV" onClick={() => fileRef.current?.click()} className="icon-button"><FileUp className="h-4 w-4" /></button>
          <button title="Xuất CSV" onClick={exportCsv} className="icon-button"><Download className="h-4 w-4" /></button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void importCsv(e)} />
        </div>
      </div>

      <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[2280px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold text-gray-700">
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-20 w-12 bg-gray-50 px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...current, ...visible.map((a) => a.id)])])} /></th>
              <SortTh label="Mã NV" column="employeeCode" sort={sort} onSort={toggleSort} width="150px" />
              <SortTh label="Nhân viên" column="name" sort={sort} onSort={toggleSort} width="285px" />
              <SortTh label="Tên đăng nhập" column="username" sort={sort} onSort={toggleSort} width="190px" />
              <th className="min-w-[180px] px-4 py-3">Phòng ban</th><th className="min-w-[185px] px-4 py-3">Chức vụ</th><th className="min-w-[115px] px-4 py-3">Vai trò</th><th className="min-w-[125px] px-4 py-3">Trạng thái</th>
              <th className="min-w-[135px] px-4 py-3">SĐT</th><th className="min-w-[145px] px-4 py-3">STK</th><th className="min-w-[170px] px-4 py-3">Ngân hàng</th><th className="min-w-[230px] px-4 py-3">Địa chỉ</th>
              <SortTh label="Ngày sinh" column="birthDate" sort={sort} onSort={toggleSort} />
              <SortTh label="Ngày vào làm" column="startDate" sort={sort} onSort={toggleSort} />
              <SortTh label="Ngày tạo" column="createdAt" sort={sort} onSort={toggleSort} />
              <th className="sticky right-0 z-20 w-24 border-l border-gray-200 bg-gray-50 px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRows /> : visible.length === 0 ? (
              <tr><td colSpan={16} className="py-24 text-center text-gray-400">Không tìm thấy tài khoản phù hợp.</td></tr>
            ) : visible.map((account) => (
              <tr key={account.id} className="group border-b border-gray-200 bg-white transition-colors hover:bg-blue-50/40">
                <td className="sticky left-0 z-[2] bg-white px-4 py-3 group-hover:bg-blue-50"><input type="checkbox" checked={selected.includes(account.id)} onChange={() => setSelected((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])} /></td>
                <td className="px-4 py-3 font-medium text-gray-600">{account.employeeCode}</td>
                <td className="px-4 py-2.5"><button onClick={() => router.push(`/nhan-vien/${account.id}`)} className="flex items-center gap-3 text-left hover:text-blue-600">
                  {account.avatarUrl ? (
                    // URL ảnh nhân sự là dữ liệu động bên ngoài, không giới hạn hostname trong next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-100" />
                  ) : <Avatar name={account.name} color={avatarColor(account.name)} size="md" />}
                  <span><b className="block max-w-[190px] truncate text-gray-900">{account.name}</b><span className="block max-w-[190px] truncate text-xs text-gray-500">{account.email ?? "—"}</span></span>
                </button></td>
                <td className="px-4 py-3 font-semibold text-gray-900">{account.username ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{account.department?.name ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{account.position ?? "—"}</td>
                <td className="px-4 py-3"><span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", account.role === "admin" ? "border-blue-600 bg-blue-600 text-white" : account.role === "manager" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-700")}>{ROLE_LABEL[account.role]}</span></td>
                <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", account.status === "active" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600")}>{account.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td>
                <td className="px-4 py-3">{account.phone ?? "—"}</td><td className="px-4 py-3">{account.bankAccount ?? "—"}</td><td className="px-4 py-3">{account.bankName ?? "—"}</td><td className="max-w-[230px] truncate px-4 py-3">{account.address ?? "—"}</td>
                <td className="px-4 py-3">{formatDate(account.birthDate)}</td><td className="px-4 py-3">{formatDate(account.startDate)}</td><td className="px-4 py-3">{formatDate(account.createdAt)}</td>
                <td
                  className={cn(
                    "sticky right-0 border-l border-gray-100 bg-white px-4 py-3 group-hover:bg-blue-50",
                    menuId === account.id ? "z-40" : "z-[2]"
                  )}
                >
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMenuId((id) => id === account.id ? null : account.id); }} className="rounded-lg p-2 hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>
                    {menuId === account.id && <div onClick={(e) => e.stopPropagation()} className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl account-menu">
                      <MenuButton icon={Eye} label="Xem chi tiết" onClick={() => { router.push(`/nhan-vien/${account.id}`); setMenuId(null); }} />
                      <MenuButton icon={Pencil} label="Chỉnh sửa" onClick={() => { setEditing(account); setMenuId(null); }} />
                      <MenuButton icon={account.status === "active" ? LockKeyhole : UnlockKeyhole} label={account.status === "active" ? "Khóa tài khoản" : "Mở khóa"} onClick={() => { void toggleStatus(account); setMenuId(null); }} />
                      <div className="my-1 border-t border-gray-100" />
                      <MenuButton icon={Trash2} label="Xóa tài khoản" danger onClick={() => { void remove(account); setMenuId(null); }} />
                    </div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2.5 text-sm">
        <div className="flex items-center gap-3 text-gray-600"><span>Tổng: <b>{filtered.length}</b> bản ghi</span><span>Hiển thị</span>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 px-2 outline-none">{PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select><span>/ trang</span>
        </div>
        <div className="flex items-center gap-1">
          <PageButton onClick={() => setPage(1)} disabled={page <= 1} icon={ChevronsLeft} />
          <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} icon={ChevronLeft} />
          <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-blue-600 px-3 font-semibold text-white">{Math.min(page, pageCount)}</span><span className="px-1 text-gray-600">/ {pageCount}</span>
          <PageButton onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} icon={ChevronRight} />
          <PageButton onClick={() => setPage(pageCount)} disabled={page >= pageCount} icon={ChevronsRight} />
        </div>
      </div>

      {editing && <AccountFormModal account={editing === "new" ? undefined : editing} departments={departments} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function Filter({ value, onChange, label, options, count }: { value: string; onChange: (value: string) => void; label: string; options: { value: string; label: string }[]; count?: number }) {
  return <label className="relative w-[112px] shrink-0"><select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 w-full appearance-none truncate rounded-xl border bg-white pl-8 pr-7 text-xs outline-none hover:bg-gray-50 focus:ring-2 focus:ring-blue-100", value ? "border-blue-400 text-blue-600" : "border-gray-200 text-gray-600")}><option value="">{label}</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ArrowDownUp className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />{count ? <span className="pointer-events-none absolute right-6 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{count}</span> : <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />}</label>;
}

function SortTh({ label, column, sort, onSort, width }: { label: string; column: SortKey; sort: { key: SortKey; direction: string }; onSort: (key: SortKey) => void; width?: string }) {
  return <th style={{ minWidth: width }} className="px-4 py-3"><button onClick={() => onSort(column)} className="flex items-center gap-2 hover:text-blue-600">{label}<ArrowDownUp className={cn("h-3.5 w-3.5", sort.key === column && "text-blue-600")} /></button></th>;
}

function MenuButton({ icon: Icon, label, onClick, danger }: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50", danger ? "text-rose-600" : "text-gray-700")}><Icon className="h-4 w-4" />{label}</button>;
}

function PageButton({ icon: Icon, ...props }: { icon: React.ElementType } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Icon className="h-4 w-4" /></button>;
}

function LoadingRows() {
  return <>{[1,2,3,4,5].map((row) => <tr key={row} className="border-b border-gray-100"><td colSpan={16} className="px-4 py-3"><div className="h-9 animate-pulse rounded-lg bg-gray-100" /></td></tr>)}</>;
}
