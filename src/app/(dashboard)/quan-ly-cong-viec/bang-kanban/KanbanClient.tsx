"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Kanban, Plus, RefreshCw, ListChecks } from "lucide-react";
import {
  taskService,
  type TaskFilters,
} from "@/services/task-service";
import type {
  WorkTask,
  TaskStatus,
  WorkTaskInput,
  WorkTaskDirectoryItem,
} from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { projectService } from "@/services/project-service";
import { Button } from "@/components/ui/Button";
import { SearchableFilterSelect } from "@/components/ui/SearchableFilterSelect";
import { MemberFilterMultiSelect } from "@/components/ui/MemberFilterMultiSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { cn } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";

const TaskFormModal = dynamic(
  () =>
    import("@/components/tasks/TaskFormModal").then((mod) => mod.TaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

const EMPTY_TASKS: WorkTask[] = [];
const EMPTY_PROJECTS: ProjectDirectoryItem[] = [];
const EMPTY_MEMBERS: ProjectMember[] = [];

type FormModalState =
  | { mode: "create" }
  | { mode: "edit"; task: WorkTask }
  | null;

interface KanbanClientProps {
  accountId: string;
  accountRole: "admin" | "manager" | "member";
  initialTasks: WorkTask[];
}

export function KanbanClient({
  accountId,
  accountRole,
  initialTasks,
}: KanbanClientProps) {
  const { confirm, notify } = useFeedback();
  const cache = useSessionDataCache();
  const isMember = accountRole === "member";
  const readOnly = isMember;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function currentFilters(): TaskFilters {
    return {
      search,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    };
  }

  const listKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.tasksList,
    filters: { search, projectId, assigneeIds },
  });

  const {
    data: taskPage,
    status: listStatus,
    error: listError,
    refresh: refreshTasks,
    setData: setTaskPage,
  } = useSessionQuery<WorkTask[]>({
    key: listKey,
    fetcher: (signal) => taskService.getTasks(currentFilters(), { signal }),
    ttl: CACHE_TTL.list,
    initialData: initialTasks,
  });

  const tasks = (taskPage ?? initialTasks ?? EMPTY_TASKS) as WorkTask[];
  const loading = listStatus === "loading" && taskPage === undefined;
  const error = listStatus === "error" && taskPage === undefined;

  // Danh sách công việc hiển thị trên bảng sau khi áp bộ lọc (được suy diễn,
  // không dùng setState trong effect).
  const filteredTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      if (term && !task.title.toLocaleLowerCase().includes(term)) return false;
      if (projectId && task.projectId !== projectId) return false;
      if (
        assigneeIds.length &&
        !task.assignees.some((a: ProjectMember) => assigneeIds.includes(a.id))
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, search, projectId, assigneeIds]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!listError) return;
    notify({
      type: "error",
      title: "Không thể tải bảng Kanban",
      description: getErrorMessage(listError, "Vui lòng kiểm tra kết nối và thử lại."),
    });
  }, [listError, notify]);

  function openEdit(task: WorkTask) {
    setFormModal({ mode: "edit", task });
  }

  async function handleDelete(task: WorkTask) {
    if (readOnly || deletingId) return;
    const confirmed = await confirm({
      title: "Xóa công việc?",
      description: `Công việc “${task.title}” sẽ bị xóa khỏi bảng Kanban. Hành động này không thể hoàn tác.`,
      confirmLabel: "Xóa công việc",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(task.id);
    startTransition(() => {
      setTaskPage((previous) =>
        (previous ?? []).filter((item) => item.id !== task.id)
      );
    });

    try {
      const deleted = await taskService.deleteTask(task.id);
      if (!deleted)
        throw new Error("Công việc không tồn tại hoặc đã được xóa trước đó.");
      cache.invalidate(CACHE_RESOURCE.tasksList, listKey);
      notify({
        type: "success",
        title: "Đã xóa công việc",
        description: `Công việc “${task.title}” đã được xóa.`,
      });
    } catch (deleteError) {
      cache.invalidate(CACHE_RESOURCE.tasksList);
      await refreshTasks();
      notify({
        type: "error",
        title: "Xóa công việc thất bại",
        description: getErrorMessage(
          deleteError,
          "Không thể xóa công việc. Vui lòng thử lại."
        ),
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function saveTask(input: WorkTaskInput): Promise<WorkTask> {
    if (readOnly) {
      throw new Error("Tài khoản nhân viên không có quyền lưu công việc.");
    }
    const existing = formModal?.mode === "edit" ? formModal.task : undefined;
    const optimisticTask: WorkTask = {
      id: existing?.id ?? `optimistic-task-${crypto.randomUUID()}`,
      title: input.title,
      description: input.description,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: input.projectId,
      assigneeId: input.assigneeIds[0],
      assignees: [],
      status: input.status,
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      progress: input.progress,
      tags: input.tags,
      dependsOnTaskId: input.dependsOnTaskId,
      files: input.files,
      links: input.links,
      images: input.images,
    };

    startTransition(() => {
      if (existing) {
        setTaskPage((previous) =>
          (previous ?? []).map((item) =>
            item.id === existing.id ? optimisticTask : item
          )
        );
      } else {
        setTaskPage((previous) => [optimisticTask, ...(previous ?? [])]);
      }
    });

    try {
      const saved = existing
        ? await taskService.updateTask(existing.id, input)
        : await taskService.createTask(input);
      if (!saved) throw new Error("Không lưu được công việc.");
      setTaskPage((previous) =>
        (previous ?? []).map((item) =>
          item.id === optimisticTask.id ? saved : item
        )
      );
      cache.invalidate(CACHE_RESOURCE.tasksList, listKey);
      return saved;
    } catch (saveError) {
      setTaskPage((previous) =>
        (previous ?? []).filter((item) => item.id !== optimisticTask.id)
      );
      throw saveError;
    }
  }

  async function handleMoveTask(
    taskId: string,
    newStatus: TaskStatus,
    newIndex: number
  ) {
    if (readOnly) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const columnTasks = tasks.filter((t) => t.status === newStatus);
    const targetPosition = Math.min(Math.max(newIndex, 0), columnTasks.length);

    const optimistic = reorderTaskOptimistically(
      tasks,
      taskId,
      newStatus,
      targetPosition
    );
    setTaskPage(() => optimistic);

    try {
      await taskService.moveTask(taskId, newStatus, targetPosition);
      cache.invalidate(CACHE_RESOURCE.tasksList, listKey);
      void refreshTasks();
    } catch (moveError) {
      setTaskPage((previous) =>
        (previous ?? []).map((t) =>
          t.id === taskId ? { ...t, status: task.status } : t
        )
      );
      notify({
        type: "error",
        title: "Di chuyển công việc thất bại",
        description: getErrorMessage(moveError, "Không thể di chuyển công việc."),
      });
    }
  }

  function reorderTaskOptimistically(
    tasks: WorkTask[],
    taskId: string,
    newStatus: TaskStatus,
    newIndex: number
  ): WorkTask[] {
    const rest = tasks.filter((t) => t.id !== taskId);
    const updatedTarget = {
      ...tasks.find((t) => t.id === taskId)!,
      status: newStatus,
    };
    const targetColumn = rest.filter((t) => t.status === newStatus);
    const index = Math.min(Math.max(newIndex, 0), targetColumn.length);
    return [
      ...rest.filter((t) => t.status !== newStatus),
      ...targetColumn.slice(0, index),
      updatedTarget,
      ...targetColumn.slice(index),
    ];
  }

  const directoryKeyBase = { accountId, role: accountRole };

  const projectsKey = buildCacheKey({
    ...directoryKeyBase,
    resource: CACHE_RESOURCE.directoryProjects,
  });
  const { data: projectsData } = useSessionQuery<ProjectDirectoryItem[]>({
    key: projectsKey,
    fetcher: (signal) => projectService.getProjectDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: EMPTY_PROJECTS,
  });
  const projects = projectsData ?? EMPTY_PROJECTS;

  const membersKey = buildCacheKey({
    ...directoryKeyBase,
    resource: CACHE_RESOURCE.directoryMembers,
  });
  const { data: membersData } = useSessionQuery<ProjectMember[]>({
    key: membersKey,
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: EMPTY_MEMBERS,
  });
  const members = membersData ?? EMPTY_MEMBERS;

  const dependencyKey = buildCacheKey({
    ...directoryKeyBase,
    resource: CACHE_RESOURCE.directoryTasks,
  });
  const { data: dependencyTasksData } = useSessionQuery<WorkTaskDirectoryItem[]>({
    key: dependencyKey,
    fetcher: (signal) => taskService.getTaskDirectory({ signal }),
    ttl: CACHE_TTL.directory,
    initialData: [],
  });
  const dependencyTasks = dependencyTasksData ?? [];

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [
    projects,
  ]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [
    members,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-3 xl:flex-nowrap bg-white">
        <div className="flex items-center gap-2">
          <Kanban className="h-5 w-5 text-brand-600" />
          <h1 className="text-base font-bold text-gray-900">Bảng Kanban</h1>
          <p className="text-xs text-gray-500">
            Kéo thẻ giữa các cột để thay đổi trạng thái và thứ tự.
          </p>
        </div>

        <div className="relative min-w-[160px] max-w-[340px] flex-1">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <ListChecks className="h-4 w-4" />
          </div>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm công việc trên bảng..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <SearchableFilterSelect
          className="w-[120px] shrink-0 2xl:w-[140px]"
          label="Dự án"
          searchPlaceholder="Tìm dự án..."
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))}
        />
        {!isMember && (
          <MemberFilterMultiSelect
            className="w-[140px] shrink-0 2xl:w-[160px]"
            label="Người phụ trách"
            value={assigneeIds}
            onChange={setAssigneeIds}
            options={members}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!readOnly && (
            <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
              <Plus className="h-4 w-4" />
              Thêm thẻ
            </Button>
          )}
          <button
            type="button"
            onClick={() => void refreshTasks()}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Làm mới"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 w-full overflow-x-auto overflow-y-hidden [contain:inline-size]">
          {loading ? (
            <div className="p-10 text-center text-gray-500">
              Đang tải bảng Kanban...
            </div>
          ) : error ? (
            <ErrorState onRetry={refreshTasks} />
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Không có công việc nào trên bảng"
              description="Thử thay đổi bộ lọc hoặc thêm công việc mới."
              action={
                readOnly ? undefined : (
                  <Button size="sm" onClick={() => setFormModal({ mode: "create" })}>
                    <Plus className="h-4 w-4" />
                    Thêm công việc
                  </Button>
                )
              }
            />
          ) : (
            <KanbanBoard
              tasks={filteredTasks}
              projectsById={projectsById}
              membersById={membersById}
              readOnly={readOnly}
              deletingId={deletingId ?? undefined}
              onMove={handleMoveTask}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      {!readOnly && formModal && (
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={projects}
          members={members}
          otherTasks={dependencyTasks}
          onClose={() => setFormModal(null)}
          onSave={saveTask}
        />
      )}
    </div>
  );
}
