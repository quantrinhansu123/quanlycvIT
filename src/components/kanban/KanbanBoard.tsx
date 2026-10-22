"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  MoreHorizontal,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { WorkTask } from "@/types/task";
import type { TaskStatus } from "@/types/task";
import { isTaskOverdue } from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { formatDateVN } from "@/lib/utils";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { RowActionMenu } from "@/components/ui/RowActionMenu";
import { cn } from "@/lib/utils";

interface KanbanColumnDef {
  key: TaskStatus;
  label: string;
  dotClass: string;
  bg: string;
}

const COLUMNS: KanbanColumnDef[] = [
  { key: "todo", label: "Cần làm", dotClass: "bg-gray-400", bg: "bg-gray-50" },
  { key: "inProgress", label: "Đang làm", dotClass: "bg-sky-400", bg: "bg-sky-50" },
  { key: "review", label: "Chờ duyệt", dotClass: "bg-amber-400", bg: "bg-amber-50" },
  { key: "done", label: "Đã hoàn thành", dotClass: "bg-emerald-400", bg: "bg-emerald-50" },
] as const;

const CARD_CLASSES =
  "flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm " +
  "transition-all duration-200 cursor-grab active:cursor-grabbing " +
  "hover:-translate-y-2 hover:shadow-lg";

export function KanbanBoard({
  tasks,
  projectsById,
  membersById,
  readOnly = false,
  deletingId,
  onMove,
  onEdit,
  onDelete,
}: {
  tasks: WorkTask[];
  projectsById: Map<string, ProjectDirectoryItem>;
  membersById: Map<string, ProjectMember>;
  readOnly?: boolean;
  deletingId?: string;
  onMove: (taskId: string, newStatus: TaskStatus, newIndex: number) => void;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [hoverIndex, setHoverIndex] = useState<{ column: TaskStatus; index: number } | null>(null);
  const cardRefs = useRef<Map<TaskStatus, Map<string, HTMLDivElement>>>(new Map());

  const tasksByColumn = useMemo(() => {
    const map = new Map<TaskStatus, WorkTask[]>();
    COLUMNS.forEach((col) => map.set(col.key, []));
    tasks.forEach((task) => {
      const bucket = map.get(task.status);
      if (bucket) bucket.push(task);
    });
    return map;
  }, [tasks]);

  const isDragging = draggedId !== null;

  // Inject CSS animation cho thẻ mới xuất hiện & cột đích phát sáng.
  useEffect(() => {
    if (document.getElementById("kanban-anim-style")) return;
    const style = document.createElement("style");
    style.id = "kanban-anim-style";
    style.textContent = `
      .kanban-slide-in {
        animation: kanbanSlideIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes kanbanSlideIn {
        from { opacity: 0; transform: translateY(14px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .kanban-column-drag-over {
        animation: kanbanColumnPulse 1.2s ease-in-out infinite;
      }
      @keyframes kanbanColumnPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.35); }
        50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0.12); }
      }
      .kanban-placeholder {
        animation: kanbanPlaceholderFade 0.25s ease both;
      }
      @keyframes kanbanPlaceholderFade {
        from { opacity: 0; transform: scaleY(0.7); }
        to   { opacity: 1; transform: scaleY(1); }
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById("kanban-anim-style")?.remove();
  }, []);

  const registerCardRef = useCallback(
    (column: TaskStatus, taskId: string) => (el: HTMLDivElement | null) => {
      let columnMap = cardRefs.current.get(column);
      if (!columnMap) {
        columnMap = new Map();
        cardRefs.current.set(column, columnMap);
      }
      if (el) columnMap.set(taskId, el);
      else columnMap.delete(taskId);
    },
    []
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, taskId: string) => {
      setDraggedId(taskId);
      event.dataTransfer.setData("text/plain", taskId);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setDragImage(event.currentTarget, 0, 0);
      // Giữ layout không bị hụt khi kéo: thẻ gốc hơi mờ nhưng vẫn chiếm không gian.
      (event.currentTarget as HTMLDivElement).style.opacity = "0.35";
    },
    []
  );

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    (event.currentTarget as HTMLDivElement).style.opacity = "";
    setDraggedId(null);
    setOverColumn(null);
    setHoverIndex(null);
  }, []);

  const handleColumnDragOver = useCallback(
    (event: React.DragEvent, column: TaskStatus) => {
      event.preventDefault();
      if (draggedId && overColumn !== column) {
        setOverColumn(column);
        setHoverIndex(null);
      }
    },
    [draggedId, overColumn]
  );

  const handleColumnDragLeave = useCallback(() => {
    setOverColumn(null);
    setHoverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent, column: TaskStatus, targetIndex?: number) => {
      event.preventDefault();
      if (!draggedId) return;
      setOverColumn(null);
      setHoverIndex(null);

      // Nếu thả lên một thẻ cụ thể, dùng targetIndex từ thẻ đó.
      if (targetIndex !== undefined) {
        onMove(draggedId, column, targetIndex);
        return;
      }

      // Nếu thả vào vùng trống của cột, tính vị trí từ các thẻ hiện có.
      const columnMap = cardRefs.current.get(column);
      const entries = columnMap ? Array.from(columnMap.entries()) : [];

      let index = 0;
      for (const [cid, el] of entries) {
        if (cid === draggedId || !el) continue;
        const rect = el.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) break;
        index += 1;
      }

      onMove(draggedId, column, index);
    },
    [draggedId, onMove]
  );

  const handleCardDragOver = useCallback(
    (event: React.DragEvent, column: TaskStatus) => {
      event.preventDefault();
      if (!draggedId || overColumn !== column) return;

      const columnMap = cardRefs.current.get(column);
      const entries = columnMap ? Array.from(columnMap.entries()) : [];

      let index = 0;
      let found = false;
      for (const [cid, el] of entries) {
        if (cid === draggedId || !el) continue;
        const rect = el.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          found = true;
          break;
        }
        index += 1;
      }

      setHoverIndex({ column, index: found ? index : entries.length });
    },
    [draggedId, overColumn]
  );

  const isDragOverColumn = (key: TaskStatus) => overColumn === key;
  const isHoverIndex = (key: TaskStatus, idx: number) =>
    hoverIndex?.column === key && hoverIndex.index === idx;

  return (
    <div className="flex h-full min-h-[600px] gap-6 px-4 py-6 overflow-x-auto [contain:inline-size]">
      {COLUMNS.map((column) => {
        const columnTasks = tasksByColumn.get(column.key) ?? [];
        const over = isDragOverColumn(column.key);
        return (
          <section
            key={column.key}
            className={cn(
              "flex w-[320px] shrink-0 flex-col gap-4 rounded-3xl border p-1.5 transition-all duration-300",
              column.bg,
              over
                ? "border-2 border-brand-400 bg-brand-50/50 kanban-column-drag-over shadow-[0_0_0_12px_rgba(59,130,246,0.10)]"
                : "border-gray-100 bg-white shadow-sm hover:shadow-xl"
            )}
            onDragOver={(event) => handleColumnDragOver(event, column.key)}
            onDragLeave={handleColumnDragLeave}
            onDrop={(event) => handleDrop(event, column.key)}
          >
            {/* Column header */}
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 bg-white/70 backdrop-blur-md transition-all duration-300",
                over ? "border-brand-500 bg-brand-100/80" : "border-transparent"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${column.dotClass}`} />
                <h3 className="text-xs font-semibold text-gray-700 tracking-tight">
                  {column.label}
                </h3>
              </div>
              <span className="flex h-6 items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {columnTasks.length}
              </span>
            </div>

            {/* Tasks */}
            <div
              className="flex flex-1 min-h-0 flex-col gap-2.5 p-1 overflow-y-auto overscroll-behavior-contain"
            >
              {columnTasks.map((task, index) => {
                const draggingThis = isDragging && draggedId === task.id;
                const hoverHere = isHoverIndex(column.key, index);
                const placeholderBefore = hoverHere && index > 0;

                return (
                  <Fragment key={task.id}>
                    {placeholderBefore && (
                      <div
                        className="kanban-placeholder h-[8px] rounded-lg border border-dashed border-brand-400 bg-brand-50/60 mx-2"
                      />
                    )}
                    <KanbanCard
                      task={task}
                      column={column.key}
                      index={index}
                      registerRef={registerCardRef}
                      isDragging={draggingThis}
                      isDraggingOver={over}
                      projectsById={projectsById}
                      membersById={membersById}
                      readOnly={readOnly}
                      deletingId={deletingId}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) => handleCardDragOver(event, column.key)}
                      onDrop={(event) => handleDrop(event, column.key, index)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      animateIn={!draggingThis && index === 0}
                    />
                  </Fragment>
                );
              })}
              {hoverIndex?.column === column.key &&
                hoverIndex.index === columnTasks.length && (
                  <div
                    className="kanban-placeholder h-[8px] rounded-lg border border-dashed border-brand-400 bg-brand-50/60 mx-2"
                  />
                )}
              {columnTasks.length === 0 && (
                <div className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-xs text-gray-400">
                  Trống
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface KanbanCardProps {
  task: WorkTask;
  column: TaskStatus;
  index: number;
  registerRef: (column: TaskStatus, taskId: string) => (el: HTMLDivElement | null) => void;
  isDragging: boolean;
  isDraggingOver: boolean;
  projectsById: Map<string, ProjectDirectoryItem>;
  membersById: Map<string, ProjectMember>;
  readOnly?: boolean;
  deletingId?: string;
  onDragStart: (event: React.DragEvent, taskId: string) => void;
  onDragEnd: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent, column: TaskStatus, targetIndex: number) => void;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  animateIn?: boolean;
}

function KanbanCard({
  task,
  column,
  index,
  registerRef,
  isDragging,
  isDraggingOver,
  projectsById,
  membersById,
  readOnly = false,
  deletingId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
  onDelete,
  animateIn = false,
}: KanbanCardProps) {
  const overdue = isTaskOverdue(task);
  const project = projectsById.get(task.projectId);
  const assignee = membersById.get(task.assigneeId);
  const ref = registerRef(column, task.id);

  return (
    <div
      ref={ref}
      id={`kanban-card-${task.id}`}
      draggable={!readOnly && !deletingId}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        const el = event.currentTarget as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        const targetIndex =
          event.clientY < rect.top + rect.height / 2 ? index : index + 1;
        onDrop(event, column, targetIndex);
      }}
      className={cn(
        CARD_CLASSES,
        animateIn && "kanban-slide-in",
        isDragging ? "opacity-0 pointer-events-none absolute" : "",
        isDraggingOver && "ring-2 ring-brand-400 bg-brand-50/40",
        task.status === "done" && "opacity-60 grayscale-[0.3]",
        deletingId === task.id && "opacity-50 pointer-events-none"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {project ? (
          <Badge color={project.color} className="max-w-full whitespace-normal leading-4">
            {project.name}
          </Badge>
        ) : null}
        {!readOnly && (
          <RowActionMenu
            label={`Thao tác công việc ${task.title}`}
            items={[
              {
                icon: Clock,
                label: "Xem chi tiết",
                onClick: () => onEdit(task),
              },
              {
                icon: MoreHorizontal,
                label: "Chỉnh sửa",
                tone: "warning",
                disabled: task.status === "done" || Boolean(deletingId),
                onClick: () => onEdit(task),
              },
              {
                icon: AlertTriangle,
                label: deletingId === task.id ? "Đang xóa..." : "Xóa công việc",
                tone: "danger",
                disabled: Boolean(deletingId) || task.status === "done",
                onClick: () => onDelete(task),
              },
            ]}
          />
        )}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="line-clamp-2 text-sm font-semibold text-gray-800">
            {task.title}
          </p>
          {task.description && (
            <p className="line-clamp-1 text-xs text-gray-400">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {overdue && <AlertTriangle className="h-3 w-3 text-rose-500" />}
          {task.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatDateVN(task.dueDate)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={task.status} />
        <TaskPriorityBadge priority={task.priority} />
        {overdue && <OverdueTag />}
      </div>

      {(task.assignees.length > 0 || assignee) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {task.assignees.length > 1 ? (
            <>
              <AvatarStack people={task.assignees} max={3} size="sm" />
              <span>{task.assignees.length} người</span>
            </>
          ) : assignee && (
            <>
              <Avatar name={assignee.name} color={assignee.avatarColor} size="sm" />
              <span className="truncate max-w-[70px]">{task.assignees.length > 0 ? task.assignees[0].name : assignee.name}</span>
            </>
          )}
        </div>
      )}

      <ProgressBar value={task.progress} className="w-full h-1.5" />
    </div>
  );
}
