"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  LayoutGrid,
  Plus,
  Search,
  Table as TableIcon,
  ListTodo,
} from "lucide-react";
import { taskService } from "@/services/task-service";
import { subtaskService, type SubtaskListFilters, type SubtaskPage as SubtaskPageResult } from "@/services/subtask-service";
import { projectService } from "@/services/project-service";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import type { AccountRole } from "@/types/account";
import type { WorkTaskDirectoryItem, TaskPriority, TaskStatus } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, SUBTASK_STATUS_OPTIONS } from "@/types/task";
import type { Subtask } from "@/types/subtask";
import { Button } from "@/components/ui/Button";
import { MemberFilterMultiSelect } from "@/components/ui/MemberFilterMultiSelect";
import { SearchableFilterSelect } from "@/components/ui/SearchableFilterSelect";
import { SearchableFilterMultiSelect } from "@/components/ui/SearchableFilterMultiSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SubtaskTable } from "@/components/subtasks/SubtaskTable";
import { SubtaskCard } from "@/components/subtasks/SubtaskCard";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { exportTablePdf } from "@/lib/pdf-export";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";

const SubtaskFormModal = dynamic(
  () => import("@/components/subtasks/SubtaskFormModal").then((mod) => mod.SubtaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);
const SubtaskQuickViewModal = dynamic(
  () => import("@/components/subtasks/SubtaskQuickViewModal").then((mod) => mod.SubtaskQuickViewModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);
const TaskReportDrawer = dynamic(
  () => import("@/components/tasks/TaskReportDrawer").then((mod) => mod.TaskReportDrawer),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

const EMPTY_PROJECTS: ProjectDirectoryItem[] = [];
const EMPTY_MEMBERS: ProjectMember[] = [];
const EMPTY_WORK_TASKS: WorkTaskDirectoryItem[] = [];
const EMPTY_SUBTASKS: Subtask[] = [];
const SUBTASK_ACCEPTED_EVENT = "app:subtask-accepted";

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; subtask: Subtask } | null;
type QuickViewState = { subtask: Subtask; tab: "info" | "reports" | "timeline" } | null;

interface SubtaskListClientProps {
  accountId: string;
  accountRole: AccountRole;
  initialSubtasks: SubtaskPageResult;
  initialWorkTasks: WorkTaskDirectoryItem[];
  initialMembers: ProjectMember[];
  initialProjects: ProjectDirectoryItem[];
}

export function SubtaskListClient({
  accountId,
  accountRole,
  initialSubtasks,
  initialWorkTasks,
  initialMembers,
  initialProjects,
}: SubtaskListClientProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const cache = useSessionDataCache();
  const isAdmin = accountRole === "admin";
  const isMember = accountRole === "member";

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workTaskIds, setWorkTaskIds] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [needsTesting, setNeedsTesting] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);
  const [reportDrawer, setReportDrawer] = useState<Subtask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  function currentFilters(): Omit<SubtaskListFilters, "page" | "pageSize"> {
    return {
      search,
      workTaskIds: workTaskIds.length > 0 ? workTaskIds : undefined,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      priorities: priorities.length > 0 ? priorities : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      overdueOnly,
      needsTesting,
    };
  }

  const listKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.subtasksList,
    filters: { search, projectId, workTaskIds, assigneeIds, priorities, statuses, overdueOnly, needsTesting },
    page,
    pageSize,
  });

  const {
    data: subtaskPage,
    status: listStatus,
    error: listError,
    refresh: refreshSubtasks,
    setData: setSubtaskPage,
  } = useSessionQuery<SubtaskPageResult>({
    key: listKey,
    fetcher: (signal) => subtaskService.getSubtasksPage({ ...currentFilters(), page, pageSize }, { signal }),
    ttl: CACHE_TTL.list,
    initialData: initialSubtasks,
  });

  const subtasks = subtaskPage?.items ?? EMPTY_SUBTASKS;
  const total = subtaskPage?.total ?? 0;
  const loading = listStatus === "loading";
  const error = listStatus === "error";

  const directoryKeyBase = { accountId, role: accountRole };

  const workTasksKey = buildCacheKey({ ...directoryKeyBase, resource: CACHE_RESOURCE.directoryTasks });
  const { data: workTasksData, error: workTasksError } = useSessionQuery<WorkTaskDirectoryItem[]>({
    key: workTasksKey,
    fetcher: (signal) => taskService.getTaskDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: initialWorkTasks,
  });
  const workTasks = workTasksData ?? EMPTY_WORK_TASKS;

  const membersKey = buildCacheKey({ ...directoryKeyBase, resource: CACHE_RESOURCE.directoryMembers });
  const { data: membersData, error: membersError } = useSessionQuery<ProjectMember[]>({
    key: membersKey,
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: initialMembers,
  });
  const members = membersData ?? EMPTY_MEMBERS;

  const projectsKey = buildCacheKey({ ...directoryKeyBase, resource: CACHE_RESOURCE.directoryProjects });
  const { data: projectsData, error: projectsError } = useSessionQuery<ProjectDirectoryItem[]>({
    key: projectsKey,
    fetcher: (signal) => projectService.getProjectDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: initialProjects,
  });
  const projects = projectsData ?? EMPTY_PROJECTS;

  const workTasksById = useMemo(() => new Map(workTasks.map((t) => [t.id, t])), [workTasks]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Bộ lọc "Công việc" chỉ hiển thị công việc thuộc dự án đang chọn.
  const workTaskOptions = useMemo(
    () => (projectId ? workTasks.filter((t) => t.projectId === projectId) : workTasks),
    [workTasks, projectId]
  );

  useEffect(() => {
    if (!listError) return;
    notify({
      type: "error",
      title: "Không thể tải danh sách task",
      description: getErrorMessage(listError, "Vui lòng kiểm tra kết nối và thử lại."),
    });
  }, [listError, notify]);

  useEffect(() => {
    if (!workTasksError && !membersError && !projectsError) return;
    notify({
      type: "error",
      title: "Không thể tải dữ liệu bộ lọc",
      description: getErrorMessage(
        workTasksError ?? membersError ?? projectsError,
        "Không thể tải công việc hoặc danh sách nhân sự."
      ),
    });
  }, [workTasksError, membersError, projectsError, notify]);

  useEffect(() => {
    function handleSubtaskAccepted(event: Event) {
      const accepted = (event as CustomEvent<Subtask>).detail;
      if (!accepted?.id) return;

      setSubtaskPage((previous) => {
        if (!previous || !previous.items.some((item) => item.id === accepted.id)) {
          return previous ?? { items: [], total: 0 };
        }

        // Xác nhận chuyển Task từ Chưa làm sang Đang làm. Nếu danh sách
        // đang lọc theo trạng thái cũ thì loại bản ghi ngay.
        if (statuses.length > 0 && !statuses.includes(accepted.status)) {
          return {
            items: previous.items.filter((item) => item.id !== accepted.id),
            total: Math.max(0, previous.total - 1),
          };
        }

        return {
          items: previous.items.map((item) => item.id === accepted.id ? accepted : item),
          total: previous.total,
        };
      });
      // Key đang hiển thị đã được patch; các trang/bộ lọc khác sẽ
      // tải dữ liệu mới khi người dùng chuyển sang.
      cache.invalidate(CACHE_RESOURCE.subtasksList, listKey);
    }

    window.addEventListener(SUBTASK_ACCEPTED_EVENT, handleSubtaskAccepted);
    return () => window.removeEventListener(SUBTASK_ACCEPTED_EVENT, handleSubtaskAccepted);
  }, [cache, listKey, setSubtaskPage, statuses]);

  // Đổi dự án thì bỏ những lựa chọn "Công việc" không thuộc dự án mới.
  function handleProjectChange(nextProjectId: string) {
    setProjectId(nextProjectId);
    if (nextProjectId) {
      setWorkTaskIds((current) =>
        current.filter((id) => workTasksById.get(id)?.projectId === nextProjectId)
      );
    }
  }

  useEffect(() => {
    // Bộ lọc thay đổi thì quay về trang đầu để không rơi vào trang trống.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, projectId, workTaskIds, assigneeIds, priorities, statuses, overdueOnly, needsTesting]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function toggleSelect(id: string) {
    if (subtasks.some((subtask) => subtask.id === id && subtask.status === "done")) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = subtasks
      .filter((subtask) => subtask.status !== "done")
      .map((subtask) => subtask.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );
  }

  async function handleDelete(subtask: Subtask) {
    if (deletingId) return;
    const confirmed = await confirm({
      title: "Xóa task?",
      description: `Task “${subtask.title}” sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`,
      confirmLabel: "Xóa task",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeletingId(subtask.id);
    try {
      const deleted = await subtaskService.deleteSubtask(subtask.id);
      if (!deleted) throw new Error("Task không tồn tại hoặc đã được xóa trước đó.");
      setSubtaskPage((previous) => ({
        items: (previous?.items ?? []).filter((item) => item.id !== subtask.id),
        total: Math.max(0, (previous?.total ?? 0) - 1),
      }));
      cache.invalidate(CACHE_RESOURCE.subtasksList, listKey);
      setSelectedIds((current) => current.filter((id) => id !== subtask.id));
      setQuickView((current) => current?.subtask.id === subtask.id ? null : current);
      setReportDrawer((current) => current?.id === subtask.id ? null : current);
      notify({ type: "success", title: "Đã xóa task", description: `Task “${subtask.title}” đã được xóa.` });
    } catch (deleteError) {
      notify({
        type: "error",
        title: "Xóa task thất bại",
        description: getErrorMessage(deleteError, "Không thể xóa task. Vui lòng thử lại."),
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleApprove(subtask: Subtask) {
    try {
      await subtaskService.approveSubtask(subtask.id);
      notify({
        type: "success",
        title: "Đã duyệt task",
        description: `Task “${subtask.title}” đã chuyển sang Đã hoàn thành.`,
      });
      cache.invalidate(CACHE_RESOURCE.subtasksList);
      // Duyệt task ảnh hưởng tiến độ công việc cha (tính theo trung bình task con).
      cache.invalidate(CACHE_RESOURCE.tasksList);
      refreshSubtasks();
    } catch (approveError) {
      notify({
        type: "error",
        title: "Duyệt task thất bại",
        description: getErrorMessage(approveError, "Không thể duyệt task. Vui lòng thử lại."),
      });
    }
  }

  async function handleTest(subtask: Subtask, passed: boolean) {
    const note = passed ? undefined : window.prompt("Mô tả lỗi cần người thực hiện sửa:")?.trim();
    if (!passed && !note) return;
    try {
      await subtaskService.submitTestResult(subtask.id, { passed, note });
      notify({
        type: "success",
        title: passed ? "Task đã Pass kiểm thử" : "Đã trả Task về người thực hiện",
        description: passed ? "Task đã chuyển sang Chờ duyệt." : "Tiến độ Task đã được đặt về 99%.",
      });
      window.dispatchEvent(new CustomEvent("app:notifications-changed"));
      cache.invalidate(CACHE_RESOURCE.subtasksList);
      cache.invalidate(CACHE_RESOURCE.tasksList);
      refreshSubtasks();
    } catch (testError) {
      notify({ type: "error", title: "Không thể ghi kết quả test", description: getErrorMessage(testError, "Vui lòng thử lại.") });
    }
  }

  async function handleAccept(subtask: Subtask) {
    if (acceptingId) return;
    setAcceptingId(subtask.id);
    try {
      const accepted = await subtaskService.acceptSubtask(subtask.id);
      setSubtaskPage((previous) => ({
        items: (previous?.items ?? []).map((item) => item.id === accepted.id ? accepted : item),
        total: previous?.total ?? 0,
      }));
      cache.invalidate(CACHE_RESOURCE.subtasksList, listKey);
      window.dispatchEvent(new CustomEvent("app:notifications-changed"));
      notify({
        type: "success",
        title: "Đã xác nhận nhận Task",
        description: `Task “${subtask.title}” đã chuyển sang Đang làm.`,
      });
    } catch (acceptError) {
      notify({
        type: "error",
        title: "Không thể xác nhận Task",
        description: getErrorMessage(acceptError, "Vui lòng thử lại."),
      });
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleExportPdf() {
    try {
      const result = await subtaskService.getSubtasksPage({
        ...currentFilters(),
        page: 1,
        pageSize: Math.max(total, 1),
      });
      const exportSubtasks = result.items;
      const rows = exportSubtasks.map((subtask) => {
        const workTask = workTasksById.get(subtask.workTaskId);
        return [
          subtask.title,
          workTask?.title ?? "",
          (workTask && projectsById.get(workTask.projectId)?.name) ?? "",
          membersById.get(subtask.assigneeId)?.name ?? "",
          formatDateVN(subtask.dueDate),
          `${subtask.progress}%`,
          TASK_PRIORITY_OPTIONS.find((o) => o.value === subtask.priority)?.label ?? "",
          SUBTASK_STATUS_OPTIONS.find((o) => o.value === subtask.status)?.label ?? "",
        ];
      });
      await exportTablePdf({
        title: "Danh sách task",
        filename: "danh-sach-task.pdf",
        orientation: "landscape",
        columns: [
          { label: "Tên task", width: "*" }, { label: "Công việc", width: 100 },
          { label: "Dự án", width: 80 }, { label: "Người thực hiện", width: 72 },
          { label: "Hạn", width: 50, alignment: "center" }, { label: "Tiến độ", width: 42, alignment: "right" },
          { label: "Ưu tiên", width: 46 }, { label: "Trạng thái", width: 56 },
        ],
        rows,
      });
      notify({ type: "success", title: "Đã xuất danh sách task PDF", description: `${exportSubtasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất PDF thất bại",
        description: getErrorMessage(exportError, "Không thể tạo PDF danh sách task."),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 xl:flex-nowrap">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="relative min-w-[180px] max-w-[525px] flex-1 xl:min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm task..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <SearchableFilterSelect
          className="w-[110px] shrink-0 2xl:w-[130px]"
          label="Dự án"
          searchPlaceholder="Tìm dự án..."
          value={projectId}
          onChange={handleProjectChange}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <SearchableFilterMultiSelect
          className="w-[120px] shrink-0 2xl:w-[140px]"
          label="Công việc"
          searchPlaceholder="Tìm công việc..."
          value={workTaskIds}
          onChange={setWorkTaskIds}
          options={workTaskOptions.map((t) => ({ value: t.id, label: t.title }))}
        />
        {!isMember && (
          <MemberFilterMultiSelect
            className="w-[130px] shrink-0 2xl:w-[150px]"
            label="Người thực hiện"
            value={assigneeIds}
            onChange={setAssigneeIds}
            options={members}
          />
        )}
        <SearchableFilterMultiSelect
          className="w-[112px] shrink-0 2xl:w-[124px]"
          label="Mức độ ưu tiên"
          searchPlaceholder="Tìm mức ưu tiên..."
          value={priorities}
          onChange={(values) => setPriorities(values as TaskPriority[])}
          options={TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <SearchableFilterMultiSelect
          className="w-[92px] shrink-0 2xl:w-[104px]"
          label="Trạng thái"
          searchPlaceholder="Tìm trạng thái..."
          value={statuses}
          onChange={(values) => setStatuses(values as TaskStatus[])}
          options={SUBTASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <button
          type="button"
          onClick={() => setNeedsTesting((current) => !current)}
          className={cn(
            "flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium",
            needsTesting ? "border-violet-300 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          )}
        >
          Cần tôi test
        </button>
        <button
          type="button"
          onClick={() => setOverdueOnly((prev) => !prev)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium",
            overdueOnly ? "border-rose-300 bg-rose-50 text-rose-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Task trễ hạn
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button size="sm" className="whitespace-nowrap px-2.5" onClick={() => setFormModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn("flex h-9 w-9 items-center justify-center", viewMode === "table" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50")}
              aria-label="Xem dạng bảng"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn("flex h-9 w-9 items-center justify-center border-l border-gray-200", viewMode === "grid" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50")}
              aria-label="Xem dạng lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            title="Xuất PDF"
            disabled={subtasks.length === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất PDF"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="account-table-scroll @container min-h-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={refreshSubtasks} />
        ) : subtasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="Không tìm thấy task nào"
            description="Thử thay đổi bộ lọc hoặc tạo task mới."
            action={
              <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm task
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <SubtaskTable
            subtasks={subtasks}
            workTasksById={workTasksById}
            membersById={membersById}
            projectsById={projectsById}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onReport={setReportDrawer}
            onViewReports={(subtask) => setQuickView({ subtask, tab: "reports" })}
            onEdit={(subtask) => setFormModal({ mode: "edit", subtask })}
            onDelete={handleDelete}
            canApprove={isAdmin}
            onApprove={handleApprove}
            isMember={isMember}
            currentAccountId={accountId}
            acceptingId={acceptingId}
            onAccept={handleAccept}
            canReport={!isAdmin}
            canTest
            onPassTest={(subtask) => void handleTest(subtask, true)}
            onFailTest={(subtask) => void handleTest(subtask, false)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {subtasks.map((subtask) => (
              <SubtaskCard
                key={subtask.id}
                subtask={subtask}
                workTask={workTasksById.get(subtask.workTaskId)}
                assignee={membersById.get(subtask.assigneeId)}
                onReport={setReportDrawer}
                onViewReports={(t) => setQuickView({ subtask: t, tab: "reports" })}
                onEdit={(t) => setFormModal({ mode: "edit", subtask: t })}
                onDelete={handleDelete}
                canApprove={isAdmin}
                onApprove={handleApprove}
                isMember={isMember}
                currentAccountId={accountId}
                acceptingId={acceptingId}
                onAccept={handleAccept}
                canTest
                onPassTest={(subtask) => void handleTest(subtask, true)}
                onFailTest={(subtask) => void handleTest(subtask, false)}
              />
            ))}
          </div>
        )}
        </div>

        {!loading && !error && (
          <ListPaginationFooter
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {formModal && (
        <SubtaskFormModal
          mode={formModal.mode}
          subtask={formModal.mode === "edit" ? formModal.subtask : undefined}
          workTasks={workTasks}
          members={members}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            // Sửa task con có thể đổi tiến độ -> ảnh hưởng tiến độ công việc cha.
            cache.invalidate(CACHE_RESOURCE.tasksList);
            refreshSubtasks();
          }}
        />
      )}

      {quickView && (
        <SubtaskQuickViewModal
          subtask={quickView.subtask}
          workTask={workTasksById.get(quickView.subtask.workTaskId)}
          assignee={membersById.get(quickView.subtask.assigneeId)}
          testerOptions={members}
          initialTab={quickView.tab}
          onClose={() => setQuickView(null)}
          onReportAdded={() => {
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            cache.invalidate(CACHE_RESOURCE.tasksList);
            refreshSubtasks();
          }}
        />
      )}

      {reportDrawer && !isAdmin && (
        <TaskReportDrawer
          task={{
            id: reportDrawer.id,
            title: reportDrawer.title,
            progress: reportDrawer.progress,
            assigneeId: reportDrawer.assigneeId,
          }}
          assignee={membersById.get(reportDrawer.assigneeId)}
          tester={reportDrawer.tester}
          testerOptions={members}
          entityLabel="task"
          submitReport={(input) =>
            subtaskService.addSubtaskReport(reportDrawer.id, input)
          }
          onClose={() => setReportDrawer(null)}
          onSubmitted={() => {
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            cache.invalidate(CACHE_RESOURCE.tasksList);
            refreshSubtasks();
          }}
        />
      )}
    </div>
  );
}
