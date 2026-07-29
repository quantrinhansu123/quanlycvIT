"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  LayoutGrid,
  ListChecks,
  Plus,
  Search,
  Table as TableIcon,
} from "lucide-react";
import type { Project, ProjectMember } from "@/types/project";
import type { TaskPriority, TaskStatus, WorkTask } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import { taskService, type TaskFilters } from "@/services/task-service";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskQuickViewModal } from "@/components/tasks/TaskQuickViewModal";
import { TaskTable } from "@/components/tasks/TaskTable";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { cn, formatDateVN } from "@/lib/utils";

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; task: WorkTask } | null;
type QuickViewState = { task: WorkTask; tab: "info" | "reports" | "timeline" } | null;

interface ProjectTasksPanelProps {
  project: Project;
  members: ProjectMember[];
  onTasksChanged: () => void;
}

export function ProjectTasksPanel({ project, members, onTasksChanged }: ProjectTasksPanelProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const projectsById = useMemo(() => new Map([[project.id, project]]), [project]);

  const filters = useMemo<TaskFilters>(
    () => ({
      projectId: project.id,
      search: search || undefined,
      assigneeId: assigneeId || undefined,
      priority: priority || undefined,
      status: status || undefined,
    }),
    [assigneeId, priority, project.id, search, status]
  );

  const loadTasks = useCallback(async (nextFilters: TaskFilters) => {
    setLoading(true);
    setError(false);
    try {
      const data = await taskService.getTasks(nextFilters);
      setTasks(data);
      setSelectedIds([]);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải công việc của dự án",
        description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadTasks(filters);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters, loadTasks]);

  const totalPages = Math.max(1, Math.ceil(tasks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleTasks = useMemo(
    () => tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, tasks]
  );

  function toggleSelect(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectAll() {
    const visibleIds = visibleTasks.map((task) => task.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((taskId) => selectedIds.includes(taskId));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((taskId) => !visibleIds.includes(taskId))
        : [...new Set([...current, ...visibleIds])]
    );
  }

  async function handleDelete(task: WorkTask) {
    if (deletingId) return;
    const confirmed = await confirm({
      title: "Xóa công việc?",
      description: `Công việc “${task.title}” và các task trực thuộc sẽ bị xóa. Hành động này không thể hoàn tác.`,
      confirmLabel: "Xóa công việc",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(task.id);
    try {
      const deleted = await taskService.deleteTask(task.id);
      if (!deleted) throw new Error("Công việc không tồn tại hoặc đã được xóa trước đó.");
      notify({ type: "success", title: "Đã xóa công việc", description: `Công việc “${task.title}” đã được xóa.` });
      await loadTasks(filters);
      onTasksChanged();
    } catch (deleteError) {
      notify({
        type: "error",
        title: "Xóa công việc thất bại",
        description: getErrorMessage(deleteError, "Không thể xóa công việc. Vui lòng thử lại."),
      });
    } finally {
      setDeletingId(null);
    }
  }

  function handleExportCsv() {
    try {
      const header = ["Tên công việc", "Người phụ trách", "Hạn hoàn thành", "Tiến độ", "Ưu tiên", "Trạng thái"];
      const rows = tasks.map((task) => [
        task.title,
        membersById.get(task.assigneeId)?.name ?? "",
        formatDateVN(task.dueDate),
        `${task.progress}%`,
        TASK_PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label ?? "",
        TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label ?? "",
      ]);
      const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cong-viec-${project.code.toLowerCase()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notify({ type: "success", title: "Đã xuất danh sách công việc", description: `${tasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách công việc."),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm công việc trong dự án..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <FilterSelect
          label="Người phụ trách"
          value={assigneeId}
          onChange={setAssigneeId}
          options={members.map((member) => ({ value: member.id, label: member.name }))}
        />
        <FilterSelect
          label="Độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <FilterSelect
          label="Trạng thái"
          value={status}
          onChange={(value) => setStatus(value as TaskStatus | "")}
          options={TASK_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => setFormModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn("flex h-10 w-10 items-center justify-center", viewMode === "table" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50")}
              aria-label="Xem dạng bảng"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn("flex h-10 w-10 items-center justify-center border-l border-gray-200", viewMode === "grid" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50")}
              aria-label="Xem dạng lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={tasks.length === 0}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất file"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={() => loadTasks(filters)} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Chưa có công việc nào"
            description="Dự án chưa có công việc được tạo."
            action={
              <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm công việc
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <TaskTable
            tasks={visibleTasks}
            projectsById={projectsById}
            membersById={membersById}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onOpenTask={(task) =>
              router.push(`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`)
            }
            onReport={(task) => setQuickView({ task, tab: "reports" })}
            onEdit={(task) => setFormModal({ mode: "edit", task })}
            onDelete={handleDelete}
            hideProjectColumn
            compactActions
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                project={project}
                assignee={membersById.get(task.assigneeId)}
                onOpen={(task) =>
                  router.push(`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`)
                }
                onReport={(item) => setQuickView({ task: item, tab: "reports" })}
                onEdit={(item) => setFormModal({ mode: "edit", task: item })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span>Tổng: {tasks.length} bản ghi</span>
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>/ trang</span>
            </div>
            <div className="flex items-center gap-1">
              <PagerButton label="Trang đầu" disabled={currentPage === 1} onClick={() => setPage(1)} icon={ChevronsLeft} />
              <PagerButton label="Trang trước" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)} icon={ChevronLeft} />
              <span className="min-w-10 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white">{currentPage}</span>
              <span className="px-1">/ {totalPages}</span>
              <PagerButton label="Trang sau" disabled={currentPage === totalPages} onClick={() => setPage((current) => current + 1)} icon={ChevronRight} />
              <PagerButton label="Trang cuối" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} icon={ChevronsRight} />
            </div>
          </div>
        )}
      </div>

      {formModal && (
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={[project]}
          members={members}
          otherTasks={tasks}
          defaultProjectId={project.id}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            loadTasks(filters);
            onTasksChanged();
          }}
        />
      )}

      {quickView && (
        <TaskQuickViewModal
          task={quickView.task}
          project={project}
          assignee={membersById.get(quickView.task.assigneeId)}
          initialTab={quickView.tab}
          onClose={() => setQuickView(null)}
        />
      )}
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  icon: Icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: typeof ChevronLeft;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
