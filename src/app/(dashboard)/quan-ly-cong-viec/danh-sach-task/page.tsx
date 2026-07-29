"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { subtaskService, type SubtaskFilters } from "@/services/subtask-service";
import { projectService } from "@/services/project-service";
import type { ProjectMember } from "@/types/project";
import type { WorkTask, TaskPriority, TaskStatus } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import type { Subtask } from "@/types/subtask";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SubtaskTable } from "@/components/subtasks/SubtaskTable";
import { SubtaskCard } from "@/components/subtasks/SubtaskCard";
import { SubtaskFormModal } from "@/components/subtasks/SubtaskFormModal";
import { SubtaskQuickViewModal } from "@/components/subtasks/SubtaskQuickViewModal";
import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; subtask: Subtask } | null;
type QuickViewState = { subtask: Subtask; tab: "info" | "reports" | "timeline" } | null;

export default function SubtaskListPage() {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [workTasks, setWorkTasks] = useState<WorkTask[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [workTaskId, setWorkTaskId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);
  const [reportDrawer, setReportDrawer] = useState<Subtask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const workTasksById = useMemo(() => new Map(workTasks.map((t) => [t.id, t])), [workTasks]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const loadSubtasks = useCallback(async (filters: SubtaskFilters) => {
    setLoading(true);
    setError(false);
    try {
      const data = await subtaskService.getSubtasks(filters);
      setSubtasks(data);
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
    Promise.all([taskService.getTasks(), projectService.getDirectory()])
      .then(([taskData, memberData]) => {
        setWorkTasks(taskData);
        setMembers(memberData);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSubtasks({
        search,
        workTaskId: workTaskId || undefined,
        assigneeId: assigneeId || undefined,
        priority: priority || undefined,
        status: status || undefined,
        overdueOnly,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, workTaskId, assigneeId, priority, status, overdueOnly, loadSubtasks]);

  function currentFilters(): SubtaskFilters {
    return {
      search,
      workTaskId: workTaskId || undefined,
      assigneeId: assigneeId || undefined,
      priority: priority || undefined,
      status: status || undefined,
      overdueOnly,
    };
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === subtasks.length ? [] : subtasks.map((t) => t.id)));
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
      await loadSubtasks(currentFilters());
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

  function handleExportCsv() {
    try {
      const header = ["Tên task", "Thuộc công việc", "Người thực hiện", "Hạn hoàn thành", "Tiến độ", "Ưu tiên", "Trạng thái"];
    const rows = subtasks.map((subtask) => [
      subtask.title,
      workTasksById.get(subtask.workTaskId)?.title ?? "",
      membersById.get(subtask.assigneeId)?.name ?? "",
      formatDateVN(subtask.dueDate),
      `${subtask.progress}%`,
      TASK_PRIORITY_OPTIONS.find((o) => o.value === subtask.priority)?.label ?? "",
      TASK_STATUS_OPTIONS.find((o) => o.value === subtask.status)?.label ?? "",
    ]);
    const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "danh-sach-task.csv";
    link.click();
    URL.revokeObjectURL(url);
      notify({ type: "success", title: "Đã xuất danh sách task", description: `${subtasks.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách task."),
      });
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm task..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <FilterSelect
          label="Công việc"
          value={workTaskId}
          onChange={setWorkTaskId}
          options={workTasks.map((t) => ({ value: t.id, label: t.title }))}
        />
        <FilterSelect
          label="Người thực hiện"
          value={assigneeId}
          onChange={setAssigneeId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
        <FilterSelect
          label="Mức độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <FilterSelect
          label="Trạng thái"
          value={status}
          onChange={(value) => setStatus(value as TaskStatus | "")}
          options={TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <button
          type="button"
          onClick={() => setOverdueOnly((prev) => !prev)}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
            overdueOnly ? "border-rose-300 bg-rose-50 text-rose-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Task trễ hạn
        </button>

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
            disabled={subtasks.length === 0}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất file"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={() => loadSubtasks(currentFilters())} />
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

        {!loading && !error && subtasks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 text-sm text-gray-500">
            <span>Tổng: {subtasks.length} bản ghi</span>
            <div className="flex items-center gap-2">
              <span>Hiển thị</span>
              <select className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600" defaultValue={100}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>/ trang</span>
            </div>
          </div>
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
            loadSubtasks(currentFilters());
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
          onReportAdded={() => loadSubtasks(currentFilters())}
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
          onSubmitted={() => loadSubtasks(currentFilters())}
        />
      )}
    </div>
  );
}
