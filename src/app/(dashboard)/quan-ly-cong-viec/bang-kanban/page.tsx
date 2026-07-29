"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import type { Project, ProjectMember } from "@/types/project";
import {
  KANBAN_PROGRESS_BY_STATUS,
  type TaskPriority,
  type TaskStatus,
  type WorkTask,
} from "@/types/task";
import { TASK_PRIORITY_OPTIONS } from "@/types/task";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { ErrorState } from "@/components/ui/ErrorState";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { KANBAN_COLUMNS } from "@/components/tasks/kanban-meta";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskQuickViewModal } from "@/components/tasks/TaskQuickViewModal";
import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type FormModalState =
  | { mode: "create"; status?: TaskStatus }
  | { mode: "edit"; task: WorkTask }
  | null;

export default function KanbanPage() {
  const router = useRouter();
  const { notify } = useFeedback();

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");

  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<WorkTask | null>(null);
  const [reportTask, setReportTask] = useState<WorkTask | null>(null);

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );

  const notifyError = useCallback(
    (title: string, cause: unknown, fallback: string) => {
      notify({ type: "error", title, description: getErrorMessage(cause, fallback) });
    },
    [notify]
  );

  const fetchBoard = useCallback(
    () =>
      Promise.all([
        projectService.getProjects(),
        projectService.getDirectory(),
        taskService.getTasks(),
      ])
        .then(([projectData, memberData, taskData]) => {
          setProjects(projectData);
          setMembers(memberData);
          setTasks(taskData);
          setError(false);
          setLoading(false);
        })
        .catch((loadError) => {
          setError(true);
          setLoading(false);
          notifyError(
            "Không thể tải bảng Kanban",
            loadError,
            "Vui lòng kiểm tra kết nối và thử lại."
          );
        }),
    [notifyError]
  );

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchBoard();
  }, [fetchBoard]);

  /** Tải lại danh sách thẻ sau khi tạo/sửa/báo cáo, không hiện lại skeleton. */
  const refreshTasks = useCallback(() => {
    taskService
      .getTasks()
      .then(setTasks)
      .catch((refreshError) => {
        notifyError(
          "Không thể tải lại bảng Kanban",
          refreshError,
          "Vui lòng thử lại."
        );
      });
  }, [notifyError]);

  // Bộ lọc chạy phía client để kéo thả không phải chờ gọi lại API.
  const visibleTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (keyword && !task.title.toLowerCase().includes(keyword)) return false;
      if (projectId && task.projectId !== projectId) return false;
      if (assigneeId && task.assigneeId !== assigneeId) return false;
      if (priority && task.priority !== priority) return false;
      return true;
    });
  }, [tasks, search, projectId, assigneeId, priority]);

  /** Sắp xếp lại state cục bộ trước, gọi API sau; lỗi thì trả về trạng thái cũ. */
  const handleMove = useCallback(
    (task: WorkTask, status: TaskStatus, position: number) => {
      const snapshot = tasks;

      const columns = new Map<TaskStatus, WorkTask[]>(
        KANBAN_COLUMNS.map((columnStatus) => [columnStatus, []])
      );
      for (const item of tasks) {
        if (item.id === task.id) continue;
        columns.get(item.status)?.push(item);
      }
      for (const list of columns.values()) {
        list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      }

      const target = columns.get(status);
      if (!target) return;
      const moved: WorkTask = {
        ...task,
        status,
        progress:
          task.status === status
            ? task.progress
            : KANBAN_PROGRESS_BY_STATUS[status],
      };
      target.splice(Math.min(position, target.length), 0, moved);

      const reordered: WorkTask[] = [];
      for (const list of columns.values()) {
        list.forEach((item, index) => reordered.push({ ...item, order: index }));
      }
      setTasks(reordered);

      taskService.moveTask(task.id, status, position).catch((moveError) => {
        setTasks(snapshot);
        notifyError(
          "Không thể di chuyển công việc",
          moveError,
          "Thay đổi đã được hoàn tác. Vui lòng thử lại."
        );
      });
    },
    [tasks, notifyError]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
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
            placeholder="Tìm công việc..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <FilterSelect
          label="Dự án"
          value={projectId}
          onChange={setProjectId}
          options={projects.map((project) => ({
            value: project.id,
            label: project.code,
          }))}
        />
        <FilterSelect
          label="Người phụ trách"
          value={assigneeId}
          onChange={setAssigneeId}
          options={members.map((member) => ({
            value: member.id,
            label: member.name,
          }))}
        />
        <FilterSelect
          label="Mức độ ưu tiên"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />

        <Button onClick={() => setFormModal({ mode: "create" })}>
          <Plus className="h-4 w-4" />
          Thêm công việc
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <BoardSkeleton />
        ) : error ? (
          <ErrorState onRetry={retry} />
        ) : (
          <KanbanBoard
            tasks={visibleTasks}
            projectsById={projectsById}
            membersById={membersById}
            onMove={handleMove}
            onAdd={(status) => setFormModal({ mode: "create", status })}
            onOpen={setQuickView}
            onReport={setReportTask}
            onViewReports={setQuickView}
            onEdit={(task) => setFormModal({ mode: "edit", task })}
          />
        )}
      </div>

      {formModal && (
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={projects}
          members={members}
          otherTasks={tasks}
          defaultProjectId={projectId || undefined}
          defaultStatus={formModal.mode === "create" ? formModal.status : undefined}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            refreshTasks();
          }}
        />
      )}

      {quickView && (
        <TaskQuickViewModal
          task={quickView}
          project={projectsById.get(quickView.projectId)}
          assignee={membersById.get(quickView.assigneeId)}
          initialTab="reports"
          onClose={() => setQuickView(null)}
          onReportAdded={refreshTasks}
        />
      )}

      {reportTask && (
        <TaskReportDrawer
          task={reportTask}
          assignee={membersById.get(reportTask.assigneeId)}
          onClose={() => setReportTask(null)}
          onSubmitted={refreshTasks}
        />
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex min-h-full">
      {KANBAN_COLUMNS.map((status) => (
        <div
          key={status}
          className="flex min-w-[300px] flex-1 flex-col border-r border-gray-100 last:border-r-0"
        >
          <div className="flex items-center gap-2 px-4 py-3.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-gray-200" />
            <span className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="flex-1 space-y-3 border-t border-gray-100 bg-gray-50/40 p-3">
            <div className="h-40 animate-pulse rounded-xl bg-white" />
            <div className="h-40 animate-pulse rounded-xl bg-white" />
          </div>
        </div>
      ))}
    </div>
  );
}
