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
  ListChecks,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService, type TaskFilters } from "@/services/task-service";
import type { Project, ProjectMember } from "@/types/project";
import type { WorkTask, TaskPriority, TaskStatus } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchableFilterSelect } from "@/components/ui/SearchableFilterSelect";
import { MemberFilterMultiSelect } from "@/components/ui/MemberFilterMultiSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { TaskTable } from "@/components/tasks/TaskTable";
import { TaskCard } from "@/components/tasks/TaskCard";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

const TaskFormModal = dynamic(
  () => import("@/components/tasks/TaskFormModal").then((mod) => mod.TaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; task: WorkTask } | null;

export default function TaskListPage() {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [total, setTotal] = useState(0);
  /** Toàn bộ công việc (không phân trang), chỉ dùng để chọn "công việc tiền đề" trong form. */
  const [dependencyTasks, setDependencyTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  function currentFilters(): TaskFilters {
    return {
      search,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      priority: priority || undefined,
      status: status || undefined,
      overdueOnly,
    };
  }

  const loadTasks = useCallback(async (filters: TaskFilters, targetPage: number, size: number) => {
    setLoading(true);
    setError(false);
    try {
      const result = await taskService.getTasksPage({ ...filters, page: targetPage, pageSize: size });
      setTasks(result.items);
      setTotal(result.total);
      setSelectedIds([]);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải danh sách công việc",
        description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const refreshDependencyTasks = useCallback(() => {
    taskService.getTasks().then(setDependencyTasks).catch(() => {
      // Không chặn luồng chính nếu tải danh sách phụ thuộc thất bại.
    });
  }, []);

  useEffect(() => {
    refreshDependencyTasks();
  }, [refreshDependencyTasks]);

  useEffect(() => {
    Promise.all([projectService.getProjects(), projectService.getDirectory()])
      .then(([projectData, memberData]) => {
        setProjects(projectData);
        setMembers(memberData);
      })
      .catch((dependencyError) => {
        setError(true);
        notify({
          type: "error",
          title: "Không thể tải dữ liệu bộ lọc",
          description: getErrorMessage(dependencyError, "Không thể tải dự án hoặc danh sách nhân sự."),
        });
      });
  }, [notify]);

  useEffect(() => {
    // Bộ lọc thay đổi thì quay về trang đầu để không rơi vào trang trống.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, projectId, assigneeIds, priority, status, overdueOnly]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTasks(currentFilters(), page, pageSize);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, projectId, assigneeIds, priority, status, overdueOnly, page, pageSize, loadTasks]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = tasks.map((task) => task.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
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
      await loadTasks(currentFilters(), page, pageSize);
      refreshDependencyTasks();
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

  async function handleExportCsv() {
    try {
      const exportTasks = await taskService.getTasks(currentFilters());
      const header = ["Tên công việc", "Dự án", "Người phụ trách", "Hạn hoàn thành", "Tiến độ", "Ưu tiên", "Trạng thái"];
      const rows = exportTasks.map((task) => [
        task.title,
        projectsById.get(task.projectId)?.name ?? "",
        membersById.get(task.assigneeId)?.name ?? "",
        formatDateVN(task.dueDate),
        `${task.progress}%`,
        TASK_PRIORITY_OPTIONS.find((o) => o.value === task.priority)?.label ?? "",
        TASK_STATUS_OPTIONS.find((o) => o.value === task.status)?.label ?? "",
      ]);
      const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "danh-sach-cong-viec.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify({ type: "success", title: "Đã xuất danh sách công việc", description: `${exportTasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách công việc."),
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
            placeholder="Tìm công việc..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <SearchableFilterSelect
          className="w-[110px] shrink-0 2xl:w-[130px]"
          label="Dự án"
          searchPlaceholder="Tìm dự án..."
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
        />
        <MemberFilterMultiSelect
          className="w-[130px] shrink-0 2xl:w-[150px]"
          label="Người phụ trách"
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
          Việc trễ hạn
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
            onClick={() => void handleExportCsv()}
            disabled={total === 0}
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
          <ErrorState onRetry={() => loadTasks(currentFilters(), page, pageSize)} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Không tìm thấy công việc nào"
            description="Thử thay đổi bộ lọc hoặc tạo công việc mới."
            action={
              <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm công việc
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <TaskTable
            tasks={tasks}
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
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                project={projectsById.get(task.projectId)}
                assignee={membersById.get(task.assigneeId)}
                onOpen={(task) =>
                  router.push(`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`)
                }
                onEdit={(t) => setFormModal({ mode: "edit", task: t })}
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
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={projects}
          members={members}
          otherTasks={dependencyTasks}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            loadTasks(currentFilters(), page, pageSize);
            refreshDependencyTasks();
          }}
        />
      )}

    </div>
  );
}
