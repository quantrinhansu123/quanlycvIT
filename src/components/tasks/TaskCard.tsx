"use client";

import { CalendarDays, Eye, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { WorkTask } from "@/types/task";
import { isTaskOverdue } from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { formatDateVN } from "@/lib/utils";
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink";

interface TaskCardProps {
  task: WorkTask;
  project?: ProjectDirectoryItem;
  assignee?: ProjectMember;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  readOnly?: boolean;
  deletingId?: string | null;
}

export function TaskCard({
  task,
  project,
  assignee,
  onEdit,
  onDelete,
  readOnly = false,
  deletingId = null,
}: TaskCardProps) {
  const router = useRouter();
  const overdue = isTaskOverdue(task);
  const locked = task.status === "done";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        {project ? (
          <Badge color={project.color ?? "blue"} className="max-w-full whitespace-normal leading-4">
            {project.name}
          </Badge>
        ) : <span />}
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            <ActionIconButton
              icon={Eye}
              label="Xem chi tiết"
              onClick={() => router.push(`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`)}
            />
            <ActionIconButton
              icon={Pencil}
              label="Chỉnh sửa"
              tone="warning"
              disabled={locked || Boolean(deletingId)}
              onClick={() => onEdit(task)}
            />
            <ActionIconButton
              icon={Trash2}
              label={deletingId === task.id ? "Đang xóa..." : "Xóa công việc"}
              tone="danger"
              disabled={Boolean(deletingId)}
              onClick={() => onDelete(task)}
            />
          </div>
        )}
      </div>

      <IntentPrefetchLink
        href={`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`}
        className="text-left"
      >
        <p className="line-clamp-1 text-sm font-semibold text-gray-800 hover:text-brand-600">{task.title}</p>
        {task.description && <p className="mt-1 line-clamp-2 text-xs text-gray-400">{task.description}</p>}
      </IntentPrefetchLink>

      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusBadge status={task.status} />
        <TaskPriorityBadge priority={task.priority} />
        {overdue && <OverdueTag />}
      </div>

      {task.assignees.length > 1 ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <AvatarStack people={task.assignees} max={3} />
          {task.assignees.length} người phụ trách
        </div>
      ) : (
        (assignee ?? task.assignees[0]) && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Avatar
              name={(assignee ?? task.assignees[0]).name}
              color={(assignee ?? task.assignees[0]).avatarColor}
              size="sm"
            />
            {(assignee ?? task.assignees[0]).name}
          </div>
        )
      )}

      <div className="flex items-center gap-1 text-xs text-gray-400">
        <CalendarDays className="h-3.5 w-3.5" />
        Hạn: {formatDateVN(task.dueDate)}
      </div>

      <ProgressBar value={task.progress} className="w-full" />
    </div>
  );
}
