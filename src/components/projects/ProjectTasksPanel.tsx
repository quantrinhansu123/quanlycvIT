"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
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
import { TaskTable } from "@/components/tasks/TaskTable";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { exportTablePdf } from "@/lib/pdf-export";
import { cn, formatDateVN } from "@/lib/utils";

const TaskFormModal = dynamic(
  () => import("@/components/tasks/TaskFormModal").then((mod) => mod.TaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; task: WorkTask } | null;

interface ProjectTasksPanelProps {
  project: Project;
  members: ProjectMember[];
  onTasksChanged: () => void;
  readOnly?: boolean;
}

export function ProjectTasksPanel({
  project,
  members,
  onTasksChanged,
  readOnly = false,
}: ProjectTasksPanelProps) {
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
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
    if (readOnly || deletingId) return;
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
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedIds((current) => current.filter((id) => id !== task.id));
      notify({ type: "success", title: "Đã xóa công việc", description: `Công việc “${task.title}” đã được xóa.` });
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

  async function handleExportPdf() {
    try {
      const rows = tasks.map((task) => [
        task.title,
        membersById.get(task.assigneeId)?.name ?? "",
        formatDateVN(task.dueDate),
        `${task.progress}%`,
        TASK_PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label ?? "",
        TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label ?? "",
      ]);
      await exportTablePdf({
        title: `Công việc dự án ${project.code}`,
        subtitle: `${project.name} - ${tasks.length} công việc`,
        filename: `cong-viec-${project.code.toLowerCase()}.pdf`,
        columns: [
          { label: "Tên công việc", width: "*" }, { label: "Người phụ trách", width: 78 },
          { label: "Hạn", width: 52, alignment: "center" }, { label: "Tiến độ", width: 45, alignment: "right" },
          { label: "Ưu tiên", width: 48 }, { label: "Trạng thái", width: 60 },
        ],
        rows,
      });
      notify({ type: "success", title: "Đã xuất danh sách công việc PDF", description: `${tasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất PDF thất bại",
        description: getErrorMessage(exportError, "Không thể tạo PDF danh sách công việc."),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm công việc trong dự án..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <FilterSelect
          compact
          label="Người phụ trách"
          value={assigneeId}
          onChange={setAssigneeId}
          options={members.map((member) => ({ value: member.id, label: member.name }))}
        />
        <FilterSelect
          compact
          label="Độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <FilterSelect
          compact
          label="Trạng thái"
          value={status}
          onChange={(value) => setStatus(value as TaskStatus | "")}
          options={TASK_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <div className="ml-auto flex items-center gap-2">
          {!readOnly && <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>}
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
            disabled={tasks.length === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất PDF"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={() => loadTasks(filters)} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Chưa có công việc nào"
            description="Dự án chưa có công việc được tạo."
            action={readOnly ? undefined :
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
            onEdit={(task) => setFormModal({ mode: "edit", task })}
            onDelete={handleDelete}
            hideProjectColumn
            readOnly={readOnly}
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
                onEdit={(item) => setFormModal({ mode: "edit", task: item })}
                onDelete={handleDelete}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
        </div>

        {!loading && !error && (
          <ListPaginationFooter
            total={tasks.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {formModal && !readOnly && (
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={[project]}
          members={members}
          otherTasks={tasks}
          defaultProjectId={project.id}
          onClose={() => setFormModal(null)}
          onSaved={(saved) => {
            setTasks((current) => {
              const exists = current.some((task) => task.id === saved.id);
              return exists
                ? current.map((task) => task.id === saved.id ? saved : task)
                : [saved, ...current];
            });
            setFormModal(null);
            onTasksChanged();
          }}
        />
      )}

    </div>
  );
}
