"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownCircle, ArrowDownUp, ArrowUpCircle, CalendarDays,
  CircleDollarSign, Download, Eye, FilterX, Gauge, Landmark,
  Pencil, Plus, ReceiptText, RefreshCw, Search, Tags, Trash2,
  WalletCards, X,
} from "lucide-react";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { SearchableFilterMultiSelect } from "@/components/ui/SearchableFilterMultiSelect";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { apiClient } from "@/services/api-client";
import { getErrorMessage } from "@/lib/errors";
import { exportTablePdf } from "@/lib/pdf-export";
import { cn, getAppDateKey } from "@/lib/utils";
import type {
  FinanceCategory, FinanceCategoryInput, FinanceDashboardData, FinanceInput, FinanceSummary,
  FinanceTransaction, FinanceTransactionPage, FinanceType,
} from "@/types/finance";

const FinanceTransactionModal = dynamic(() => import("./FinanceTransactionModal").then((mod) => mod.FinanceTransactionModal), { ssr: false, loading: () => <ModalLoadingFallback /> });
const FinanceTransactionDetailModal = dynamic(() => import("./FinanceTransactionDetailModal").then((mod) => mod.FinanceTransactionDetailModal), { ssr: false, loading: () => <ModalLoadingFallback /> });
const FinanceCategoryModal = dynamic(() => import("./FinanceCategoryModal").then((mod) => mod.FinanceCategoryModal), { ssr: false, loading: () => <ModalLoadingFallback /> });
const TransferQrModal = dynamic(() => import("./TransferQrModal").then((mod) => mod.TransferQrModal), { ssr: false, loading: () => <ModalLoadingFallback /> });

type SortKey = "date" | "amount" | "createdAt";
type DatePreset = "month" | "lastMonth" | "quarter" | "year";
const EMPTY_SUMMARY: FinanceSummary = { income: 0, expense: 0, series: [], budgets: [] };
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatDate(value: string) { return dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00`)); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function initialRange() { const end = getAppDateKey(); return { start: `${end.slice(0, 7)}-01`, end }; }

export function FinanceManagementPage() {
  const { notify, confirm } = useFeedback();
  const [initial] = useState(initialRange);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [preset, setPreset] = useState<DatePreset | "custom">("month");
  const [summary, setSummary] = useState<FinanceSummary>(EMPTY_SUMMARY);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<FinanceType | "">("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | "new" | null>(null);
  const [viewing, setViewing] = useState<FinanceTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<FinanceType>("chi");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const lastTransactionQuery = useRef("");
  const lastSummaryRange = useRef("");

  const transactionQuery = useCallback((requestedPage = page, requestedSize = pageSize) => {
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(requestedSize), start, end, sort: sort.key, direction: sort.direction });
    if (type) params.set("type", type);
    categoryIds.forEach((categoryId) => params.append("categoryId", categoryId));
    if (search) params.set("search", search);
    return `/thu-chi?${params}`;
  }, [categoryIds, end, page, pageSize, search, sort.direction, sort.key, start, type]);

  const loadDashboard = useCallback(async (query: string, showLoading = true, signal?: AbortSignal) => {
    if (showLoading) { setLoadingSummary(true); setLoadingTransactions(true); }
    try {
      const path = query.replace("/thu-chi?", "/thu-chi/khoi-tao?");
      const result = await apiClient.get<FinanceDashboardData>(path, { signal });
      setCategories(result.categories);
      setSummary(result.summary);
      setTransactions(result.transactions.items);
      setTotal(result.transactions.total);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify({ type: "error", title: "Không thể tải dữ liệu thu chi", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      if (showLoading) { setLoadingSummary(false); setLoadingTransactions(false); }
    }
  }, [notify]);
  const loadTransactions = useCallback(async (query: string, showLoading = true, signal?: AbortSignal) => {
    if (showLoading) setLoadingTransactions(true);
    try {
      const result = await apiClient.get<FinanceTransactionPage>(query, { signal });
      setTransactions(result.items);
      setTotal(result.total);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify({ type: "error", title: "Không thể tải giao dịch", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      if (showLoading) setLoadingTransactions(false);
    }
  }, [notify]);

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    const query = transactionQuery();
    lastTransactionQuery.current = query;
    lastSummaryRange.current = `${start}|${end}`;
    // Một request duy nhất lấy tổng quan, danh mục và giao dịch lần đầu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard(query).finally(() => setBootstrapped(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!bootstrapped) return;
    const query = transactionQuery();
    const range = `${start}|${end}`;
    if (query === lastTransactionQuery.current && range === lastSummaryRange.current) return;
    const controller = new AbortController();
    const rangeChanged = range !== lastSummaryRange.current;
    lastTransactionQuery.current = query;
    lastSummaryRange.current = range;
    if (rangeChanged) void loadDashboard(query, true, controller.signal);
    else void loadTransactions(query, true, controller.signal);
    return () => controller.abort();
  }, [bootstrapped, end, loadDashboard, loadTransactions, start, transactionQuery]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, { date: string; income: number; expense: number }>();
    for (const item of summary.series) { const row = byDate.get(item.date) ?? { date: item.date, income: 0, expense: 0 }; row[item.type === "thu" ? "income" : "expense"] += item.amount; byDate.set(item.date, row); }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [summary.series]);
  const chartMax = Math.max(1, ...chartData.flatMap((item) => [item.income, item.expense]));
  const budgeted = useMemo(() => summary.budgets.filter((item) => item.category.monthlyBudget || item.spent > 0).slice(0, 5), [summary.budgets]);
  const days = Math.max(1, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000) + 1);
  const budgetMonths = Math.max(1, (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1);
  const averageExpense = summary.expense / days;
  const activeFilters = Number(Boolean(type)) + categoryIds.length + Number(Boolean(searchInput));

  function applyPreset(next: DatePreset) {
    const now = new Date(`${getAppDateKey()}T00:00:00`); let rangeStart: Date; let rangeEnd = now;
    if (next === "lastMonth") { rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (next === "quarter") rangeStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    else if (next === "year") rangeStart = new Date(now.getFullYear(), 0, 1);
    else rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    setPreset(next); setStart(dateKey(rangeStart)); setEnd(dateKey(rangeEnd)); setPage(1);
  }
  function openNew(nextType: FinanceType) { setDefaultType(nextType); setEditing("new"); }
  async function refreshAll() { setRefreshing(true); try { await loadDashboard(transactionQuery(), false); } finally { setRefreshing(false); } }
  function matchesCurrentFilters(item: FinanceTransaction) {
    const normalizedSearch = search.toLocaleLowerCase("vi");
    return item.date >= start && item.date <= end
      && (!type || item.type === type)
      && (!categoryIds.length || categoryIds.includes(item.categoryId))
      && (!normalizedSearch || (item.description ?? "").toLocaleLowerCase("vi").includes(normalizedSearch));
  }
  async function saveTransaction(input: FinanceInput) {
    const isNew = editing === "new";
    const saved = editing && editing !== "new"
      ? await apiClient.put<FinanceTransaction>(`/thu-chi/${editing.id}`, input)
      : await apiClient.post<FinanceTransaction>("/thu-chi", input);
    setEditing(null);
    setTransactions((current) => {
      if (!isNew) return current.map((item) => item.id === saved.id ? saved : item);
      if (page !== 1 || !matchesCurrentFilters(saved)) return current;
      return [saved, ...current].slice(0, pageSize);
    });
    if (isNew && matchesCurrentFilters(saved)) setTotal((current) => current + 1);
    notify({ type: "success", title: isNew ? "Đã thêm giao dịch" : "Đã cập nhật giao dịch", description: `${input.type === "thu" ? "Thu" : "Chi"} ${money.format(input.amount)}` });
    void loadDashboard(transactionQuery(), false);
  }
  async function confirmTransfer(input: FinanceInput) {
    const saved = await apiClient.post<FinanceTransaction>("/thu-chi", input);
    setTransactions((current) => (page !== 1 || !matchesCurrentFilters(saved)) ? current : [saved, ...current].slice(0, pageSize));
    if (matchesCurrentFilters(saved)) setTotal((current) => current + 1);
    notify({ type: "success", title: "Đã ghi nhận khoản chi chuyển khoản", description: money.format(input.amount) });
    void loadDashboard(transactionQuery(), false);
  }
  async function removeTransaction(item: FinanceTransaction) {
    if (!await confirm({ title: "Xóa giao dịch này?", description: `${item.description || item.category?.name || "Giao dịch"} · ${money.format(item.amount)}. Thao tác này không thể hoàn tác.`, confirmLabel: "Xóa giao dịch" })) return;
    try { await apiClient.delete<boolean>(`/thu-chi/${item.id}`); setTransactions((current) => current.filter((transaction) => transaction.id !== item.id)); setTotal((current) => Math.max(0, current - 1)); notify({ type: "success", title: "Đã xóa giao dịch" }); void loadDashboard(transactionQuery(), false); }
    catch (error) { notify({ type: "error", title: "Không thể xóa", description: getErrorMessage(error, "Vui lòng thử lại.") }); }
  }
  async function saveCategory(input: FinanceCategoryInput, id?: string) {
    const saved = id
      ? await apiClient.put<FinanceCategory>(`/thu-chi-danh-muc/${id}`, input)
      : await apiClient.post<FinanceCategory>("/thu-chi-danh-muc", input);
    setCategories((current) => id
      ? current.map((category) => category.id === saved.id ? saved : category).sort((a, b) => a.name.localeCompare(b.name, "vi"))
      : [...current, saved].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    setTransactions((current) => current.map((transaction) => transaction.categoryId === saved.id ? { ...transaction, category: saved } : transaction));
    notify({ type: "success", title: id ? "Đã cập nhật danh mục" : "Đã thêm danh mục" });
    void loadDashboard(transactionQuery(), false);
  }
  async function removeCategory(category: FinanceCategory) {
    if (!await confirm({ title: `Xóa danh mục “${category.name}”?`, description: "Chỉ có thể xóa danh mục chưa được sử dụng trong giao dịch.", confirmLabel: "Xóa danh mục" })) return;
    try { await apiClient.delete<boolean>(`/thu-chi-danh-muc/${category.id}`); setCategories((current) => current.filter((item) => item.id !== category.id)); notify({ type: "success", title: "Đã xóa danh mục" }); void loadDashboard(transactionQuery(), false); }
    catch (error) { notify({ type: "error", title: "Không thể xóa danh mục", description: getErrorMessage(error, "Danh mục có thể đang được sử dụng.") }); }
  }
  function clearFilters() { setSearchInput(""); setSearch(""); setType(""); setCategoryIds([]); setPage(1); }
  async function exportPdf() {
    try {
      const result = await apiClient.get<FinanceTransactionPage>(transactionQuery(1, 5000));
      await exportTablePdf({
        title: "Báo cáo thu chi văn phòng",
        subtitle: `Từ ${formatDate(start)} đến ${formatDate(end)} - ${result.items.length} giao dịch`,
        filename: `thu-chi-${start}-${end}.pdf`,
        columns: [
          { label: "Ngày", width: 52, alignment: "center" }, { label: "Loại", width: 38 },
          { label: "Danh mục", width: 72 }, { label: "Nội dung", width: "*" },
          { label: "Số tiền", width: 72, alignment: "right" }, { label: "Chứng từ", width: 48, alignment: "center" },
        ],
        rows: result.items.map((item) => [
          formatDate(item.date), item.type === "thu" ? "Thu" : "Chi", item.category?.name,
          item.description, money.format(item.amount), item.receiptUrl ? "Có" : "Không",
        ]),
      });
      notify({ type: "success", title: `Đã xuất ${result.items.length} giao dịch ra PDF` });
    } catch (error) { notify({ type: "error", title: "Không thể xuất PDF", description: getErrorMessage(error, "Vui lòng thử lại.") }); }
  }
  function toggleSort(key: SortKey) { setSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" })); setPage(1); }

  return (
    <div className="min-h-full bg-gray-50/70 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"><WalletCards className="h-5 w-5" /></span><div><h1 className="text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">Quản lý thu chi</h1><p className="text-xs text-gray-500 sm:text-sm">Theo dõi dòng tiền và kiểm soát ngân sách văn phòng</p></div></div></div>
          <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={() => setTransferModalOpen(true)}><Landmark className="h-4 w-4" />Chuyển khoản</Button><Button variant="secondary" onClick={() => setCategoryModalOpen(true)}><Tags className="h-4 w-4" />Danh mục</Button><Button variant="secondary" onClick={() => openNew("thu")} className="text-emerald-700"><ArrowUpCircle className="h-4 w-4" />Thêm khoản thu</Button><Button onClick={() => openNew("chi")}><Plus className="h-4 w-4" />Thêm khoản chi</Button></div>
        </header>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm" aria-label="Khoảng thời gian báo cáo">
          <span className="flex items-center gap-2 px-2 text-xs font-semibold text-gray-600"><CalendarDays className="h-4 w-4 text-brand-600" />Thời gian</span>
          <div className="flex max-w-full gap-1 overflow-x-auto">{([['month','Tháng này'],['lastMonth','Tháng trước'],['quarter','Quý này'],['year','Năm nay']] as [DatePreset,string][]).map(([value,label]) => <button key={value} type="button" onClick={() => applyPreset(value)} className={cn("h-8 shrink-0 rounded-full px-4 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", preset === value ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800")}>{label}</button>)}</div>
          <span className="hidden h-6 w-px bg-gray-200 sm:block" />
          <label className="flex items-center gap-1.5 text-xs text-gray-500"><span className="hidden sm:inline">Từ</span><input type="date" value={start} max={end} onChange={(e) => { setPreset("custom"); setStart(e.target.value); setPage(1); }} className="h-8 rounded-lg border border-gray-200 px-2 outline-none transition hover:border-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500"><span className="hidden sm:inline">đến</span><input type="date" value={end} min={start} onChange={(e) => { setPreset("custom"); setEnd(e.target.value); setPage(1); }} className="h-8 rounded-lg border border-gray-200 px-2 outline-none transition hover:border-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>
          <button type="button" onClick={() => void refreshAll()} disabled={refreshing} className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50" title="Tải lại dữ liệu"><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /></button>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Tổng quan thu chi">
          <SummaryCard loading={loadingSummary} icon={ArrowUpCircle} label="Tổng thu" value={summary.income} tone="income" note={`${chartData.filter((item) => item.income > 0).length} ngày có khoản thu`} />
          <SummaryCard loading={loadingSummary} icon={ArrowDownCircle} label="Tổng chi" value={summary.expense} tone="expense" note={`${chartData.filter((item) => item.expense > 0).length} ngày có khoản chi`} />
          <SummaryCard loading={loadingSummary} icon={Gauge} label="Chi trung bình/ngày" value={averageExpense} tone="neutral" note={`Tính trên ${days} ngày`} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-gray-900">Dòng tiền theo ngày</h2><p className="mt-1 text-xs text-gray-500">So sánh thu và chi trong khoảng đã chọn</p></div><div className="flex gap-3 text-[11px] text-gray-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Thu</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Chi</span></div></div>
            {loadingSummary ? <div className="mt-5 h-48 animate-pulse rounded-xl bg-gray-100" /> : chartData.length ? <div className="account-table-scroll mt-5 overflow-x-auto pb-1"><div className="flex h-48 min-w-[520px] items-end gap-2 border-b border-gray-200 px-1">{chartData.map((item) => <div key={item.date} className="group flex min-w-7 flex-1 flex-col items-center justify-end gap-1 self-stretch" title={`${formatDate(item.date)} · Thu ${money.format(item.income)} · Chi ${money.format(item.expense)}`}><div className="flex w-full flex-1 items-end justify-center gap-1"><span className="w-[38%] max-w-4 rounded-t bg-emerald-500/80 transition-all duration-300 group-hover:bg-emerald-500" style={{ height: `${Math.max(item.income ? 4 : 0, (item.income / chartMax) * 100)}%` }} /><span className="w-[38%] max-w-4 rounded-t bg-rose-500/80 transition-all duration-300 group-hover:bg-rose-500" style={{ height: `${Math.max(item.expense ? 4 : 0, (item.expense / chartMax) * 100)}%` }} /></div><span className="pb-1 text-[9px] text-gray-400">{item.date.slice(8,10)}/{item.date.slice(5,7)}</span></div>)}</div></div> : <div className="flex h-52 items-center justify-center text-center"><div><CircleDollarSign className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-sm font-medium text-gray-500">Chưa có dữ liệu dòng tiền</p></div></div>}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between"><div><h2 className="text-sm font-bold text-gray-900">Ngân sách chi</h2><p className="mt-1 text-xs text-gray-500">Mức sử dụng trong kỳ đã chọn</p></div><button type="button" onClick={() => setCategoryModalOpen(true)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Thiết lập</button></div>
            {loadingSummary ? <div className="mt-5 space-y-4">{[1,2,3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}</div> : budgeted.length ? <div className="mt-4 space-y-4">{budgeted.map(({ category, spent }) => { const budget = (category.monthlyBudget ?? 0) * budgetMonths; const percent = budget ? Math.round(spent / budget * 100) : 0; return <div key={category.id} className="group"><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium text-gray-700 group-hover:text-brand-600">{category.name}</span><span className={cn("shrink-0 font-semibold", percent > 100 ? "text-rose-600" : "text-gray-600")}>{compactMoney.format(spent)}{budget ? ` / ${compactMoney.format(budget)}` : ""}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={cn("h-full rounded-full transition-all duration-500", percent > 100 ? "bg-rose-500" : percent >= 80 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${Math.min(percent || (spent ? 8 : 0), 100)}%` }} /></div>{budget > 0 && <p className={cn("mt-1 text-[10px]", percent > 100 ? "text-rose-500" : "text-gray-400")}>{percent > 100 ? `Vượt ${money.format(spent - budget)}` : `Đã dùng ${percent}% ngân sách${budgetMonths > 1 ? ` của ${budgetMonths} tháng` : ""}`}</p>}</div>; })}</div> : <div className="flex h-44 flex-col items-center justify-center text-center"><Gauge className="h-8 w-8 text-gray-300" /><p className="mt-2 text-sm font-medium text-gray-500">Chưa thiết lập ngân sách</p><button type="button" onClick={() => setCategoryModalOpen(true)} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">Quản lý danh mục</button></div>}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-9 text-sm outline-none transition hover:border-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Tìm theo nội dung giao dịch..." />{searchInput && <button type="button" onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Xóa tìm kiếm"><X className="h-4 w-4" /></button>}</div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <div className="w-[150px] shrink-0">
                <SingleSelectDropdown
                  compact
                  showSelectionIndicator={false}
                  value={type}
                  onChange={(value) => { setType(value as FinanceType | ""); setCategoryIds([]); setPage(1); }}
                  placeholder="Tất cả loại"
                  options={[
                    { value: "", label: "Tất cả loại" },
                    { value: "thu", label: "Khoản thu", dotClassName: "bg-emerald-500" },
                    { value: "chi", label: "Khoản chi", dotClassName: "bg-rose-500" },
                  ]}
                />
              </div>
              <SearchableFilterMultiSelect
                className="w-[190px] shrink-0"
                value={categoryIds}
                onChange={(value) => { setCategoryIds(value); setPage(1); }}
                label="Tất cả danh mục"
                searchPlaceholder="Tìm danh mục..."
                options={categories.filter((item) => !type || item.type === type).map((item) => ({ value: item.id, label: item.name, sublabel: item.type === "thu" ? "Khoản thu" : "Khoản chi" }))}
              />
              {activeFilters > 0 && <button type="button" onClick={clearFilters} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-brand-600"><FilterX className="h-4 w-4" />Xóa lọc</button>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => void exportPdf()} className="icon-button" title="Xuất PDF"><Download className="h-4 w-4" /></button><Button size="sm" className="h-9" onClick={() => openNew("chi")}><Plus className="h-4 w-4" />Thêm giao dịch</Button></div>
          </div>
          <div className="account-table-scroll overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600"><tr className="border-b border-gray-200"><SortHeader label="Ngày" column="date" sort={sort} onSort={toggleSort} /><th className="px-4 py-3">Loại</th><th className="px-4 py-3">Danh mục</th><th className="min-w-[280px] px-4 py-3">Nội dung</th><SortHeader label="Số tiền" column="amount" sort={sort} onSort={toggleSort} align="right" /><th className="w-32 px-4 py-3 text-center">Thao tác</th></tr></thead>
              <tbody>{loadingTransactions ? <LoadingRows /> : transactions.length === 0 ? <tr><td colSpan={6}><EmptyState icon={ReceiptText} title="Chưa có giao dịch phù hợp" description={activeFilters ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." : "Thêm khoản thu hoặc chi đầu tiên để bắt đầu theo dõi."} action={!activeFilters ? <Button size="sm" onClick={() => openNew("chi")}><Plus className="h-4 w-4" />Thêm giao dịch</Button> : undefined} /></td></tr> : transactions.map((item) => <tr key={item.id} className="data-table-row group border-b border-gray-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">{formatDate(item.date)}</td>
                <td className="px-4 py-3"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", item.type === "thu" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{item.type === "thu" ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}{item.type === "thu" ? "Thu" : "Chi"}</span></td>
                <td className="px-4 py-3"><span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{item.category?.name ?? "Không xác định"}</span></td>
                <td className="max-w-[420px] px-4 py-3"><p className="truncate font-medium text-gray-800" title={item.description}>{item.description || "—"}</p><p className="mt-0.5 text-[11px] text-gray-400">Tạo lúc {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(item.createdAt))}</p></td>
                <td className={cn("whitespace-nowrap px-4 py-3 text-right font-bold", item.type === "thu" ? "text-emerald-600" : "text-rose-600")}>{item.type === "thu" ? "+" : "−"}{money.format(item.amount)}</td>
                <td className="px-4 py-3"><div className="flex justify-center gap-1.5"><ActionIconButton icon={Eye} label="Xem chi tiết" onClick={() => setViewing(item)} /><ActionIconButton icon={Pencil} label="Chỉnh sửa" tone="warning" onClick={() => setEditing(item)} /><ActionIconButton icon={Trash2} label="Xóa giao dịch" tone="danger" onClick={() => void removeTransaction(item)} /></div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <ListPaginationFooter total={total} page={page} pageSize={pageSize} pageSizes={[10,20,50,100]} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </section>
      </div>
      {editing && <FinanceTransactionModal transaction={editing === "new" ? undefined : editing} categories={categories} defaultType={defaultType} onClose={() => setEditing(null)} onSave={saveTransaction} />}
      {viewing && <FinanceTransactionDetailModal transaction={viewing} onClose={() => setViewing(null)} onEdit={() => { setViewing(null); setEditing(viewing); }} />}
      {categoryModalOpen && <FinanceCategoryModal categories={categories} onClose={() => setCategoryModalOpen(false)} onSave={saveCategory} onDelete={removeCategory} />}
      {transferModalOpen && <TransferQrModal categories={categories} onClose={() => setTransferModalOpen(false)} onConfirm={confirmTransfer} />}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, note, tone, loading }: { icon: React.ElementType; label: string; value: number; note: string; tone: "income" | "expense" | "neutral"; loading: boolean }) {
  const styles = { income: "bg-emerald-50 text-emerald-600", expense: "bg-rose-50 text-rose-600", neutral: "bg-amber-50 text-amber-600" }[tone];
  return <div className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"><div className="flex items-start justify-between"><span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105", styles)}><Icon className="h-5 w-5" /></span><span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</span></div>{loading ? <div className="mt-4 h-7 w-36 animate-pulse rounded bg-gray-100" /> : <p className={cn("mt-3 truncate text-xl font-bold tracking-tight text-gray-950", value < 0 && "text-rose-600")} title={money.format(value)}>{money.format(value)}</p>}<p className="mt-1 text-[11px] text-gray-400">{note}</p></div>;
}

function SortHeader({ label, column, sort, onSort, align }: { label: string; column: SortKey; sort: { key: SortKey; direction: string }; onSort: (key: SortKey) => void; align?: "right" }) {
  return <th className={cn("px-4 py-3", align === "right" && "text-right")}><button type="button" onClick={() => onSort(column)} className={cn("inline-flex items-center gap-1.5 transition hover:text-brand-600", align === "right" && "flex-row-reverse")}><ArrowDownUp className={cn("h-3.5 w-3.5", sort.key === column && "text-brand-600")} />{label}</button></th>;
}

function LoadingRows() { return <>{[1,2,3,4,5].map((row) => <tr key={row} className="border-b border-gray-100"><td colSpan={6} className="px-4 py-3"><div className="h-10 animate-pulse rounded-lg bg-gray-100" /></td></tr>)}</>; }
