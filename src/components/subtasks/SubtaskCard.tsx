"use client";

import { CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react";
import type { Subtask } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { WorkTaskDirectoryItem } from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { TaskActionMenu } from "@/components/tasks/TaskActionMenu";
import { formatDateVN } from "@/lib/utils";
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink";

interface SubtaskCardProps {
  subtask: Subtask;
  workTask?: WorkTaskDirectoryItem;
  assignee?: ProjectMember;
  /** Chỉ quản trị viên mới thấy thao tác Duyệt khi task đang chờ đánh giá. */
  canApprove?: boolean;
  onReport: (subtask: Subtask) => void;
  onViewReports: (subtask: Subtask) => void;
  onEdit: (subtask: Subtask) => void;
  onDelete: (subtask: Subtask) => void;
  onApprove?: (subtask: Subtask) => void;
  isMember?: boolean;
  currentAccountId?: string;
  acceptingId?: string | null;
  onAccept?: (subtask: Subtask) => void;
  canTest?: boolean;
  onPassTest?: (subtask: Subtask) => void;
  onFailTest?: (subtask: Subtask) => void;
  readOnly?: boolean;
}

export function SubtaskCard({
  subtask,
  workTask,
  assignee,
  canApprove = false,
  onViewReports,
  onEdit,
  onDelete,
  onApprove,
  isMember = false,
  currentAccountId,
  acceptingId,
  onAccept,
  canTest = false,
  onPassTest,
  onFailTest,
  readOnly = false,
}: SubtaskCardProps) {
  const overdue = isSubtaskOverdue(subtask);
  const viewOnly = readOnly || subtask.status === "done";
  const needsAcceptance = Boolean(
    isMember &&
    currentAccountId &&
    currentAccountId !== subtask.testerId &&
    !subtask.acceptedAssigneeIds.includes(currentAccountId)
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        {workTask ? (
          <span className="truncate text-xs font-semibold text-gray-400">{workTask.title}</span>
        ) : (
          <span />
        )}
        {viewOnly ? null : needsAcceptance && onAccept ? (
          <button
            type="button"
            onClick={() => onAccept(subtask)}
            disabled={acceptingId === subtask.id}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
          >
            {acceptingId === subtask.id ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Xác nhận
          </button>
        ) : <TaskActionMenu
          onViewReports={() => onViewReports(subtask)}
          onApprove={
            canApprove && subtask.status === "review" && subtask.progress === 100 && onApprove
              ? () => onApprove(subtask)
              : undefined
          }
          onPassTest={
            canTest && subtask.status === "testing" &&
            (canApprove || currentAccountId === subtask.testerId) && onPassTest
              ? () => onPassTest(subtask)
              : undefined
          }
          onFailTest={
            canTest && subtask.status === "testing" &&
            (canApprove || currentAccountId === subtask.testerId) && onFailTest
              ? () => onFailTest(subtask)
              : undefined
          }
          onEdit={() => onEdit(subtask)}
          onDelete={() => onDelete(subtask)}
        />}
      </div>

      <IntentPrefetchLink
        href={`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`}
        className="text-left"
      >
        <p className="line-clamp-1 text-sm font-semibold text-gray-800 hover:text-brand-600">{subtask.title}</p>
        {subtask.description && <p className="mt-1 line-clamp-2 text-xs text-gray-400">{subtask.description}</p>}
      </IntentPrefetchLink>

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
