"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { subtaskService, type SubtaskListFilters } from "@/services/subtask-service";
import { projectService } from "@/services/project-service";
import type { Project, ProjectMember } from "@/types/project";
import type { WorkTask, TaskPriority, TaskStatus } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import type { Subtask } from "@/types/subtask";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
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

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; subtask: Subtask } | null;
type QuickViewState = { subtask: Subtask; tab: "info" | "reports" | "timeline" } | null;

export default function SubtaskListPage() {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workTasks, setWorkTasks] = useState<WorkTask[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workTaskIds, setWorkTaskIds] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);
  const [reportDrawer, setReportDrawer] = useState<Subtask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const workTasksById = useMemo(() => new Map(workTasks.map((t) => [t.id, t])), [workTasks]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Bộ lọc "Công việc" chỉ hiển thị công việc thuộc dự án đang chọn.
  const workTaskOptions = useMemo(
    () => (projectId ? workTasks.filter((t) => t.projectId === projectId) : workTasks),
    [workTasks, projectId]
  );

  function currentFilters(): Omit<SubtaskListFilters, "page" | "pageSize"> {
    return {
      search,
      workTaskIds: workTaskIds.length > 0 ? workTaskIds : undefined,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      priority: priority || undefined,
      status: status || undefined,
      overdueOnly,
    };
  }

  const loadSubtasks = useCallback(async (
    filters: Omit<SubtaskListFilters, "page" | "pageSize">,
    targetPage: number,
    size: number
  ) => {
    setLoading(true);
    setError(false);
    try {
      const result = await subtaskService.getSubtasksPage({ ...filters, page: targetPage, pageSize: size });
      setSubtasks(result.items);
      setTotal(result.total);
      setSelectedIds([]);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải danh sách task",
        description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    Promise.all([taskService.getTasks(), projectService.getDirectory(), projectService.getProjects()])
      .then(([taskData, memberData, projectData]) => {
        setWorkTasks(taskData);
        setMembers(memberData);
        setProjects(projectData);
      })
      .catch((dependencyError) => {
        setError(true);
        notify({
          type: "error",
          title: "Không thể tải dữ liệu bộ lọc",
          description: getErrorMessage(dependencyError, "Không thể tải công việc hoặc danh sách nhân sự."),
        });
      });
  }, [notify]);

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
  }, [search, projectId, workTaskIds, assigneeIds, priority, status, overdueOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSubtasks(currentFilters(), page, pageSize);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, projectId, workTaskIds, assigneeIds, priority, status, overdueOnly, page, pageSize, loadSubtasks]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = subtasks.map((subtask) => subtask.id);
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
      notify({ type: "success", title: "Đã xóa task", description: `Task “${subtask.title}” đã được xóa.` });
      await loadSubtasks(currentFilters(), page, pageSize);
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

  async function handleExportCsv() {
    try {
      const result = await subtaskService.getSubtasksPage({
        ...currentFilters(),
        page: 1,
        pageSize: Math.max(total, 1),
      });
      const exportSubtasks = result.items;
      const header = ["Tên task", "Thuộc công việc", "Dự án", "Người thực hiện", "Hạn hoàn thành", "Tiến độ", "Ưu tiên", "Trạng thái"];
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
          TASK_STATUS_OPTIONS.find((o) => o.value === subtask.status)?.label ?? "",
        ];
      });
      const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "danh-sach-task.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify({ type: "success", title: "Đã xuất danh sách task", description: `${exportSubtasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách task."),
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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
        <MemberFilterMultiSelect
          className="w-[130px] shrink-0 2xl:w-[150px]"
          label="Người thực hiện"
          value={assigneeIds}
          onChange={setAssigneeIds}
          options={members}
        />
        <FilterSelect
          compact
          className="w-[112px] shrink-0 2xl:w-[124px]"
          label="Mức độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <FilterSelect
          compact
          className="w-[92px] shrink-0 2xl:w-[104px]"
          label="Trạng thái"
          value={status}
          onChange={(value) => setStatus(value as TaskStatus | "")}
          options={TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
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
            onClick={handleExportCsv}
            disabled={subtasks.length === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất file"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={() => loadSubtasks(currentFilters(), page, pageSize)} />
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
            onOpenSubtask={(subtask) =>
              router.push(`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`)
            }
            onReport={setReportDrawer}
            onViewReports={(subtask) => setQuickView({ subtask, tab: "reports" })}
            onEdit={(subtask) => setFormModal({ mode: "edit", subtask })}
            onDelete={handleDelete}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {subtasks.map((subtask) => (
              <SubtaskCard
                key={subtask.id}
                subtask={subtask}
                workTask={workTasksById.get(subtask.workTaskId)}
                assignee={membersById.get(subtask.assigneeId)}
                onOpen={(subtask) =>
                  router.push(`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`)
                }
                onReport={setReportDrawer}
                onViewReports={(t) => setQuickView({ subtask: t, tab: "reports" })}
                onEdit={(t) => setFormModal({ mode: "edit", subtask: t })}
                onDelete={handleDelete}
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
            loadSubtasks(currentFilters(), page, pageSize);
          }}
        />
      )}

      {quickView && (
        <SubtaskQuickViewModal
          subtask={quickView.subtask}
          workTask={workTasksById.get(quickView.subtask.workTaskId)}
          assignee={membersById.get(quickView.subtask.assigneeId)}
          initialTab={quickView.tab}
          onClose={() => setQuickView(null)}
          onReportAdded={() => loadSubtasks(currentFilters(), page, pageSize)}
        />
      )}

      {reportDrawer && (
        <TaskReportDrawer
          task={{
            id: reportDrawer.id,
            title: reportDrawer.title,
            progress: reportDrawer.progress,
            assigneeId: reportDrawer.assigneeId,
          }}
          assignee={membersById.get(reportDrawer.assigneeId)}
          entityLabel="task"
          submitReport={(input) =>
            subtaskService.addSubtaskReport(reportDrawer.id, input)
          }
          onClose={() => setReportDrawer(null)}
          onSubmitted={() => loadSubtasks(currentFilters(), page, pageSize)}
        />
      )}
    </div>
  );
}
