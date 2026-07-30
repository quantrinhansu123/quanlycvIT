"use client";

import { CalendarDays } from "lucide-react";
import type { Subtask } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { WorkTask } from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { TaskActionMenu } from "@/components/tasks/TaskActionMenu";
import { formatDateVN } from "@/lib/utils";

interface SubtaskCardProps {
  subtask: Subtask;
  workTask?: WorkTask;
  assignee?: ProjectMember;
  onOpen: (subtask: Subtask) => void;
  onReport: (subtask: Subtask) => void;
  onViewReports: (subtask: Subtask) => void;
  onEdit: (subtask: Subtask) => void;
  onDelete: (subtask: Subtask) => void;
}

export function SubtaskCard({ subtask, workTask, assignee, onOpen, onViewReports, onEdit, onDelete }: SubtaskCardProps) {
  const overdue = isSubtaskOverdue(subtask);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        {workTask ? (
          <span className="truncate text-xs font-semibold text-gray-400">{workTask.title}</span>
        ) : (
          <span />
        )}
        <TaskActionMenu
          onViewReports={() => onViewReports(subtask)}
          onEdit={() => onEdit(subtask)}
          onDelete={() => onDelete(subtask)}
        />
      </div>

      <button type="button" onClick={() => onOpen(subtask)} className="text-left">
        <p className="line-clamp-1 text-sm font-semibold text-gray-800 hover:text-brand-600">{subtask.title}</p>
        {subtask.description && <p className="mt-1 line-clamp-2 text-xs text-gray-400">{subtask.description}</p>}
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={subtask.status} />
        <TaskPriorityBadge priority={subtask.priority} />
        {overdue && <OverdueTag />}
      </div>

      {subtask.assignees.length > 1 ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <AvatarStack people={subtask.assignees} max={3} />
          {subtask.assignees.length} người thực hiện
        </div>
      ) : (
        (assignee ?? subtask.assignees[0]) && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Avatar
              name={(assignee ?? subtask.assignees[0]).name}
              color={(assignee ?? subtask.assignees[0]).avatarColor}
              size="sm"
            />
            {(assignee ?? subtask.assignees[0]).name}
          </div>
        )
      )}

      <div className="flex items-center gap-1 text-xs text-gray-400">
        <CalendarDays className="h-3.5 w-3.5" />
        Hạn: {formatDateVN(subtask.dueDate)}
      </div>

      <ProgressBar value={subtask.progress} className="w-full" />
    </div>
  );
}
