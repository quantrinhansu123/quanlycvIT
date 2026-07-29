"use client";

import { CalendarDays, Clock, History, Pencil } from "lucide-react";
import type { WorkTask } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { TaskPriorityBadge } from "@/components/tasks/TaskBadges";
import { KANBAN_STATUS_META } from "@/components/tasks/kanban-meta";
import { cn, formatDayMonth, formatSpan, shortName } from "@/lib/utils";

interface KanbanCardProps {
  task: WorkTask;
  project?: Project;
  assignee?: ProjectMember;
  dragging?: boolean;
  onOpen: (task: WorkTask) => void;
  onReport: (task: WorkTask) => void;
  onViewReports: (task: WorkTask) => void;
  onEdit: (task: WorkTask) => void;
  onDragStart: (task: WorkTask) => void;
  onDragEnd: () => void;
}

export function KanbanCard({
  task,
  project,
  assignee,
  dragging = false,
  onOpen,
  onReport,
  onViewReports,
  onEdit,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const meta = KANBAN_STATUS_META[task.status];
  const span = formatSpan(task.startDate, task.dueDate);

  return (
    <article
      data-card-id={task.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <div className={cn("h-1 w-full", meta.bar)} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          {project ? <Badge color={project.color}>{project.code}</Badge> : <span />}
          <div className="flex shrink-0 items-center gap-1">
            <TaskPriorityBadge priority={task.priority} />
            <IconButton
              icon={History}
              label="Lịch sử báo cáo"
              onClick={() => onViewReports(task)}
            />
            <IconButton icon={Pencil} label="Chỉnh sửa" onClick={() => onEdit(task)} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpen(task)}
          className="mt-2.5 block w-full text-left"
        >
          <p className="text-[15px] font-bold leading-snug text-gray-900 hover:text-blue-600">
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500">
              {task.description}
            </p>
          )}
        </button>

        <div className="mt-3.5 border-t border-gray-50 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-400">Tiến độ</span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-600">{task.progress}%</span>
              {task.status !== "done" && (
                <button
                  type="button"
                  onClick={() => onReport(task)}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  [Báo cáo]
                </button>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn("h-full rounded-full transition-all", meta.bar)}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            <span>{formatDayMonth(task.dueDate)}</span>
            {span && (
              <>
                <span className="text-gray-300">·</span>
                <Clock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                <span className="truncate">{span}</span>
              </>
            )}
          </div>
          {task.assignees.length > 1 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="font-medium text-gray-600">
                {shortName(task.assignees[0].name)} +{task.assignees.length - 1}
              </span>
              <AvatarStack people={task.assignees} max={3} />
            </div>
          ) : (
            (assignee ?? task.assignees[0]) && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="font-medium text-gray-600">
                  {shortName((assignee ?? task.assignees[0]).name)}
                </span>
                <Avatar
                  name={(assignee ?? task.assignees[0]).name}
                  color={(assignee ?? task.assignees[0]).avatarColor}
                  size="sm"
                />
              </div>
            )
          )}
        </div>
      </div>
    </article>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof History;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
