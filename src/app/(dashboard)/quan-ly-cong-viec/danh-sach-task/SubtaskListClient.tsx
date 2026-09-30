"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Download,
  Filter,
  FolderOpen,
  LayoutGrid,
  ListTree,
  Plus,
  Search,
  Table as TableIcon,
  ListTodo,
  X,
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
import { SubtaskTable, buildSubtaskGroups } from "@/components/subtasks/SubtaskTable";
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
import { useSplitView } from "@/components/layout/SplitViewShell";

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
  initialWorkTasks?: WorkTaskDirectoryItem[];
  initialMembers?: ProjectMember[];
  initialProjects?: ProjectDirectoryItem[];
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
  const pathname = usePathname();
  const { confirm, notify } = useFeedback();
  const cache = useSessionDataCache();
  const splitView = useSplitView();
  const compactList = Boolean(
    splitView?.detailOpen && !splitView.detailCollapsed && !splitView.maximized
  );
  const activeSubtaskId = compactList ? pathname.split("/").pop() : undefined;
  const isAdmin = accountRole === "admin";
  const isMember = accountRole === "member";

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workTaskIds, setWorkTaskIds] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [grouped, setGrouped] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);
  const [reportDrawer, setReportDrawer] = useState<Subtask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(1);

  function currentFilters(): Omit<SubtaskListFilters, "page" | "pageSize"> {
    return {
      search,
      workTaskIds: workTaskIds.length > 0 ? workTaskIds : undefined,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      priorities: priorities.length > 0 ? priorities : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
    };
  }

  const listKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.subtasksList,
    filters: { search, projectId, workTaskIds, assigneeIds, priorities, statuses },
    page,
    pageSize,
  });
  const {
    data: cachedSubtaskPage,
    status: listStatus,
    isRevalidating: listRevalidating,
    error: listError,
    refresh: refreshSubtasks,
    setData: setSubtaskPage,
  } = useSessionQuery<SubtaskPageResult>({
    key: listKey,
    fetcher: (signal) => subtaskService.getSubtasksPage({ ...currentFilters(), page, pageSize }, { signal }),
    ttl: CACHE_TTL.list,
    initialData: initialSubtasks,
  });

  // Giữ kết quả gần nhất trong lúc đổi bộ lọc hoặc chuyển route chi tiết. API tiếp tục
  // tải nền, còn panel trái không bị xóa thành skeleton nên thao tác có cảm giác tức thì.
  const [lastLoadedSubtaskPage, setLastLoadedSubtaskPage] = useState(initialSubtasks);
  if (cachedSubtaskPage && cachedSubtaskPage !== lastLoadedSubtaskPage) {
    setLastLoadedSubtaskPage(cachedSubtaskPage);
  }
  const subtaskPage = cachedSubtaskPage ?? lastLoadedSubtaskPage;
  const subtasks = subtaskPage?.items ?? EMPTY_SUBTASKS;
  const total = subtaskPage?.total ?? 0;
  const loading = listStatus === "loading" && subtaskPage === undefined;
  const filtering = (listStatus === "loading" || listRevalidating) && subtaskPage !== undefined;
  const error = listStatus === "error" && subtaskPage === undefined;

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

  // Gom task đang hiển thị (theo trang hiện tại) thành 2 cấp: Dự án → Công việc.
  const nestedGroups = useMemo(() => {
    if (!grouped) return null;
    const flat = buildSubtaskGroups(subtasks, workTasksById, projectsById);
    const nested: {
      key: string;
      projectName: string;
      projectCount: number;
      tasks: { key: string; workTaskTitle: string; items: Subtask[] }[];
    }[] = [];
    for (const group of flat) {
      let project = nested.find((entry) => entry.key === group.projectKey);
      if (!project) {
        project = { key: group.projectKey, projectName: group.projectName, projectCount: 0, tasks: [] };
        nested.push(project);
      }
      project.tasks.push({ key: group.key, workTaskTitle: group.workTaskTitle, items: group.items });
      project.projectCount += group.items.length;
    }
    return nested;
  }, [grouped, subtasks, workTasksById, projectsById]);

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
  }, [search, projectId, workTaskIds, assigneeIds, priorities, statuses]);

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

  function renderSubtaskCard(subtask: Subtask) {
    return (
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
        onPassTest={(item) => void handleTest(item, true)}
        onFailTest={(item) => void handleTest(item, false)}
      />
    );
  }

  function renderProjectHeader(name: string, count: number) {
    return (
      <div className="flex items-center gap-2 px-1">
        <FolderOpen className="h-4 w-4 shrink-0 text-brand-600" />
        <span className="truncate text-xs font-bold uppercase tracking-wide text-gray-700">{name}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
          {count} task
        </span>
      </div>
    );
  }

  function renderWorkTaskHeader(title: string, count: number) {
    return (
      <div className="flex items-center gap-1.5 pl-5">
        <ListTodo className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span className="truncate text-xs font-semibold text-gray-600">{title}</span>
        <span className="whitespace-nowrap text-[10px] font-medium text-gray-400">· {count} task</span>
      </div>
    );
  }

return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-white [contain:inline-size]">
      {/* Main Toolbar */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white/95 backdrop-blur-sm px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className={cn("relative min-w-[140px] flex-1", compactList ? "xl:min-w-[180px]" : "xl:max-w-[525px]")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm task..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:bg-white transition-all xl:text-xs"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!compactList && (
            <>
              <Button size="sm" className="h-9 shrink-0 whitespace-nowrap px-3 bg-brand-600 hover:bg-brand-700 text-white font-medium" onClick={() => setFormModal({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Thêm mới</span>
              </Button>
              <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white sm:flex">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn("flex h-9 w-9 items-center justify-center rounded-l-lg", viewMode === "table" ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:bg-gray-50")}
                  aria-label="Xem dạng bảng"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn("flex h-9 w-9 items-center justify-center border-l border-gray-200 rounded-r-lg", viewMode === "grid" ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:bg-gray-50")}
                  aria-label="Xem dạng lưới"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setGrouped((current) => !current)}
                title="Nhóm theo cấp Dự án và Công việc"
                aria-pressed={grouped}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors",
                  grouped ? "border-violet-300 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                <ListTree className="h-4 w-4" />
                <span className="hidden sm:inline">Nhóm</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                title="Xuất PDF"
                disabled={subtasks.length === 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                aria-label="Xuất PDF"
              >
                <Download className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Bar - collapsible on mobile */}
      <div className={cn("border-b border-gray-100 bg-white transition-all duration-200", filterDrawerOpen ? "block" : "hidden md:block")}>
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-xs font-medium text-gray-500 hidden sm:inline">Bộ lọc</span>
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
          {/* Active filter chips */}
          {(projectId || workTaskIds.length || assigneeIds.length || priorities.length || statuses.length) && (
            <div className="flex shrink-0 items-center gap-1.5 ml-auto border-l border-gray-200 pl-2">
              {projectId && projects.find(p => p.id === projectId) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-xs font-medium">
                  {projects.find(p => p.id === projectId)!.name}
                  <button type="button" onClick={() => handleProjectChange("")} className="hover:bg-brand-100 rounded-full p-0.5" aria-label="Xóa lọc dự án"><X className="h-3 w-3" /></button>
                </span>
              )}
              {workTaskIds.map(id => workTasks.find(t => t.id === id)).filter(Boolean).map(t => (
                <span key={t!.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-xs font-medium">
                  {t!.title}
                  <button type="button" onClick={() => setWorkTaskIds(curr => curr.filter(x => x !== t!.id))} className="hover:bg-sky-100 rounded-full p-0.5" aria-label={`Xóa lọc ${t!.title}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              {assigneeIds.map(id => members.find(m => m.id === id)).filter(Boolean).map(m => (
                <span key={m!.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium">
                  {m!.name}
                  <button type="button" onClick={() => setAssigneeIds(curr => curr.filter(x => x !== m!.id))} className="hover:bg-emerald-100 rounded-full p-0.5" aria-label={`Xóa lọc ${m!.name}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              {priorities.map(p => (
                <span key={p} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
                  {TASK_PRIORITY_OPTIONS.find(o => o.value === p)?.label}
                  <button type="button" onClick={() => setPriorities(curr => curr.filter(x => x !== p))} className="hover:bg-amber-100 rounded-full p-0.5" aria-label={`Xóa lọc ${p}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              {statuses.map(s => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-xs font-medium">
                  {SUBTASK_STATUS_OPTIONS.find(o => o.value === s)?.label}
                  <button type="button" onClick={() => setStatuses(curr => curr.filter(x => x !== s))} className="hover:bg-violet-100 rounded-full p-0.5" aria-label={`Xóa lọc ${s}`}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => { handleProjectChange(""); setWorkTaskIds([]); setAssigneeIds([]); setPriorities([]); setStatuses([]); }}
                className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 px-2 text-xs font-medium transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Xóa tất cả</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter toggle */}
      <div className="md:hidden border-b border-gray-100 bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => setFilterDrawerOpen(o => !o)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            filterDrawerOpen ? "bg-gray-50 text-gray-700" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          <Filter className="h-4 w-4 shrink-0" />
          <span>Bộ lọc</span>
          {filterDrawerOpen ? <X className="h-4 w-4 ml-auto" /> : <span className="ml-auto text-gray-400">Mở rộng</span>}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {filtering && (
          <div
            className="absolute right-3 top-2 z-20 rounded-full border border-sky-100 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-sky-700 shadow-sm"
            role="status"
            aria-live="polite"
          >
            Đang cập nhật...
          </div>
        )}
        <div className="account-table-scroll @container min-h-0 w-0 min-w-full flex-1 overflow-auto [contain:inline-size]">
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
        ) : compactList ? (
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
            compact={compactList}
            activeId={activeSubtaskId}
          />
        ) : viewMode === "table" ? (
          <>
          <div className="hidden sm:block">
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
            grouped={grouped}
            hideWorkTaskColumn={grouped}
          />
          </div>
          <div className="grid grid-cols-1 gap-2.5 p-3 sm:hidden">
            {nestedGroups ? (
              <div className="space-y-5">
                {nestedGroups.map((project) => (
                  <section key={project.key} className="space-y-2">
                    {renderProjectHeader(project.projectName, project.projectCount)}
                    {project.tasks.map((task) => (
                      <div key={task.key} className="space-y-2">
                        {renderWorkTaskHeader(task.workTaskTitle, task.items.length)}
                        <div className="grid grid-cols-1 gap-2.5">
                          {task.items.map(renderSubtaskCard)}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              subtasks.map(renderSubtaskCard)
            )}
          </div>
          </>
        ) : nestedGroups ? (
          <div className="space-y-6 p-5">
            {nestedGroups.map((project) => (
              <section key={project.key} className="space-y-3">
                {renderProjectHeader(project.projectName, project.projectCount)}
                {project.tasks.map((task) => (
                  <div key={task.key} className="space-y-2">
                    {renderWorkTaskHeader(task.workTaskTitle, task.items.length)}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {task.items.map(renderSubtaskCard)}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {subtasks.map(renderSubtaskCard)}
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
          projects={projects}
          workTasks={workTasks}
          members={members}
          onClose={() => setFormModal(null)}
          onSaved={(saved) => {
            const isEdit = formModal?.mode === "edit";
            setFormModal(null);
            setSubtaskPage((previous) => {
              const currentItems = previous?.items ?? [];
              const currentTotal = previous?.total ?? 0;
              const exists = currentItems.some((item) => item.id === saved.id);
              if (exists) {
                return {
                  items: currentItems.map((item) => (item.id === saved.id ? saved : item)),
                  total: currentTotal,
                };
              }
              if (!isEdit && page === 1) {
                return {
                  items: [saved, ...currentItems].slice(0, pageSize),
                  total: currentTotal + 1,
                };
              }
              return {
                items: currentItems,
                total: isEdit ? currentTotal : currentTotal + 1,
              };
            });
            cache.invalidate(CACHE_RESOURCE.subtasksList, listKey);
            // Sửa task con có thể đổi tiến độ -> ảnh hưởng tiến độ công việc cha.
            cache.invalidate(CACHE_RESOURCE.tasksList);
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
