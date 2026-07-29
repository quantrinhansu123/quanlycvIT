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
  ListTodo,
  Plus,
  Search,
  Table as TableIcon,
} from "lucide-react";
import type { ProjectMember } from "@/types/project";
import type { Subtask } from "@/types/subtask";
import type { TaskPriority, TaskStatus, WorkTask } from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import { subtaskService, type SubtaskFilters } from "@/services/subtask-service";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { SubtaskCard } from "@/components/subtasks/SubtaskCard";
import { SubtaskFormModal } from "@/components/subtasks/SubtaskFormModal";
import { SubtaskQuickViewModal } from "@/components/subtasks/SubtaskQuickViewModal";
import { SubtaskTable } from "@/components/subtasks/SubtaskTable";
import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { cn, formatDateVN } from "@/lib/utils";

type ViewMode = "table" | "grid";
type FormModalState = { mode: "create" } | { mode: "edit"; subtask: Subtask } | null;
type QuickViewState = { subtask: Subtask; tab: "info" | "reports" | "timeline" } | null;

interface WorkTaskSubtasksPanelProps {
  workTask: WorkTask;
  /** Toàn bộ nhân sự, dùng để hiển thị tên trong bảng. */
  members: ProjectMember[];
  onSubtasksChanged: () => void;
}

export function WorkTaskSubtasksPanel({
  workTask,
  members,
  onSubtasksChanged,
}: WorkTaskSubtasksPanelProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
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
  const [reportDrawer, setReportDrawer] = useState<Subtask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );
  const workTasksById = useMemo(
    () => new Map([[workTask.id, workTask]]),
    [workTask]
  );

  const filters = useMemo<SubtaskFilters>(
    () => ({
      workTaskId: workTask.id,
      search: search || undefined,
      assigneeId: assigneeId || undefined,
      priority: priority || undefined,
      status: status || undefined,
    }),
    [assigneeId, priority, search, status, workTask.id]
  );

  const loadSubtasks = useCallback(
    async (nextFilters: SubtaskFilters) => {
      setLoading(true);
      setError(false);
      try {
        const data = await subtaskService.getSubtasks(nextFilters);
        setSubtasks(data);
        setSelectedIds([]);
      } catch (loadError) {
        setError(true);
        notify({
          type: "error",
          title: "Không thể tải task của công việc",
          description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
        });
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadSubtasks(filters);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters, loadSubtasks]);

  const totalPages = Math.max(1, Math.ceil(subtasks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleSubtasks = useMemo(
    () => subtasks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, subtasks]
  );

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleSelectAll() {
    const visibleIds = visibleSubtasks.map((subtask) => subtask.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
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
      notify({
        type: "success",
        title: "Đã xóa task",
        description: `Task “${subtask.title}” đã được xóa.`,
      });
      await loadSubtasks(filters);
      onSubtasksChanged();
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
      const header = [
        "Tên task",
        "Người thực hiện",
        "Hạn hoàn thành",
        "Tiến độ",
        "Ưu tiên",
        "Trạng thái",
      ];
      const rows = subtasks.map((subtask) => [
        subtask.title,
        subtask.assignees.map((member) => member.name).join(" / "),
        formatDateVN(subtask.dueDate),
        `${subtask.progress}%`,
        TASK_PRIORITY_OPTIONS.find((option) => option.value === subtask.priority)?.label ?? "",
        TASK_STATUS_OPTIONS.find((option) => option.value === subtask.status)?.label ?? "",
      ]);
      const csvContent = [header, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
      const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "danh-sach-task.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify({
        type: "success",
        title: "Đã xuất danh sách task",
        description: `${subtasks.length} bản ghi đã được xuất.`,
      });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách task."),
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
            placeholder="Tìm task trong công việc..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <FilterSelect
          label="Người thực hiện"
          value={assigneeId}
          onChange={setAssigneeId}
          options={workTask.assignees.map((member) => ({
            value: member.id,
            label: member.name,
          }))}
        />
        <FilterSelect
          label="Độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <FilterSelect
          label="Trạng thái"
          value={status}
          onChange={(value) => setStatus(value as TaskStatus | "")}
          options={TASK_STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
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
              className={cn(
                "flex h-10 w-10 items-center justify-center",
                viewMode === "table" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"
              )}
              aria-label="Xem dạng bảng"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-10 w-10 items-center justify-center border-l border-gray-200",
                viewMode === "grid" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"
              )}
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

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState onRetry={() => loadSubtasks(filters)} />
        ) : subtasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="Chưa có task nào"
            description="Chia nhỏ công việc này thành các task để phân công cho từng thành viên."
            action={
              <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm task
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <SubtaskTable
            subtasks={visibleSubtasks}
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
            hideWorkTaskColumn
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSubtasks.map((subtask) => (
              <SubtaskCard
                key={subtask.id}
                subtask={subtask}
                workTask={workTask}
                assignee={membersById.get(subtask.assigneeId)}
                onOpen={(subtask) =>
                  router.push(`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`)
                }
                onReport={setReportDrawer}
                onViewReports={(item) => setQuickView({ subtask: item, tab: "reports" })}
                onEdit={(item) => setFormModal({ mode: "edit", subtask: item })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!loading && !error && subtasks.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span>Tổng: {subtasks.length} bản ghi</span>
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
              <PagerButton
                label="Trang đầu"
                disabled={currentPage === 1}
                onClick={() => setPage(1)}
                icon={ChevronsLeft}
              />
              <PagerButton
                label="Trang trước"
                disabled={currentPage === 1}
                onClick={() => setPage((current) => current - 1)}
                icon={ChevronLeft}
              />
              <span className="min-w-10 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white">
                {currentPage}
              </span>
              <span className="px-1">/ {totalPages}</span>
              <PagerButton
                label="Trang sau"
                disabled={currentPage === totalPages}
                onClick={() => setPage((current) => current + 1)}
                icon={ChevronRight}
              />
              <PagerButton
                label="Trang cuối"
                disabled={currentPage === totalPages}
                onClick={() => setPage(totalPages)}
                icon={ChevronsRight}
              />
            </div>
          </div>
        )}
      </div>

      {formModal && (
        <SubtaskFormModal
          mode={formModal.mode}
          subtask={formModal.mode === "edit" ? formModal.subtask : undefined}
          workTasks={[workTask]}
          members={members}
          defaultWorkTaskId={workTask.id}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            loadSubtasks(filters);
            onSubtasksChanged();
          }}
        />
      )}

      {quickView && (
        <SubtaskQuickViewModal
          subtask={quickView.subtask}
          workTask={workTask}
          assignee={membersById.get(quickView.subtask.assigneeId)}
          initialTab={quickView.tab}
          onClose={() => setQuickView(null)}
          onReportAdded={() => {
            loadSubtasks(filters);
            onSubtasksChanged();
          }}
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
          onSubmitted={() => {
            loadSubtasks(filters);
            onSubtasksChanged();
          }}
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
