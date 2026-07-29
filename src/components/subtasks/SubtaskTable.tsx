"use client";

import { CalendarDays } from "lucide-react";
import type { Subtask } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { WorkTask } from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { TaskActionMenu } from "@/components/tasks/TaskActionMenu";
import { formatDateVN } from "@/lib/utils";

interface SubtaskTableProps {
  subtasks: Subtask[];
  workTasksById: Map<string, WorkTask>;
  membersById: Map<string, ProjectMember>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenSubtask: (subtask: Subtask) => void;
  onReport: (subtask: Subtask) => void;
  onViewReports: (subtask: Subtask) => void;
  onEdit: (subtask: Subtask) => void;
  onDelete: (subtask: Subtask) => void;
  hideWorkTaskColumn?: boolean;
}

export function SubtaskTable({
  subtasks,
  workTasksById,
  membersById,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenSubtask,
  onReport,
  onViewReports,
  onEdit,
  onDelete,
  hideWorkTaskColumn = false,
}: SubtaskTableProps) {
  const allSelected = subtasks.length > 0 && selectedIds.length === subtasks.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="w-12 px-6 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="Chọn tất cả"
              />
            </th>
            <th className="px-3 py-3">Tên task</th>
            {!hideWorkTaskColumn && <th className="px-3 py-3">Thuộc công việc</th>}
            <th className="px-3 py-3">Người thực hiện</th>
            <th className="px-3 py-3">Hạn hoàn thành</th>
            <th className="px-3 py-3">Tiến độ</th>
            <th className="px-3 py-3">Ưu tiên</th>
            <th className="px-3 py-3">Trạng thái</th>
            <th className="w-40 px-3 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {subtasks.map((subtask) => {
            const workTask = workTasksById.get(subtask.workTaskId);
            const assignee = membersById.get(subtask.assigneeId);
            const overdue = isSubtaskOverdue(subtask);

            return (
              <tr key={subtask.id} className="group transition-colors hover:bg-gray-50/60">
                <td className="px-6 py-4 align-top">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(subtask.id)}
                    onChange={() => onToggleSelect(subtask.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label={`Chọn task ${subtask.title}`}
                  />
                </td>
                <td className="max-w-xs px-3 py-4 align-top">
                  <button
                    type="button"
                    onClick={() => onOpenSubtask(subtask)}
                    className="block truncate text-left text-sm font-semibold text-gray-800 hover:text-blue-600"
                  >
                    {subtask.title}
                  </button>
                  {subtask.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{subtask.description}</p>
                  )}
                </td>
                {!hideWorkTaskColumn && (
                  <td className="max-w-[180px] px-3 py-4 align-top">
                    <span className="block truncate text-sm text-gray-600">{workTask?.title ?? "--"}</span>
                  </td>
                )}
                <td className="px-3 py-4 align-top">
                  {subtask.assignees.length > 1 ? (
                    <div className="flex items-center gap-2">
                      <AvatarStack people={subtask.assignees} max={3} />
                      <span className="text-sm text-gray-600">
                        {subtask.assignees.length} người
                      </span>
                    </div>
                  ) : assignee ?? subtask.assignees[0] ? (
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={(assignee ?? subtask.assignees[0]).name}
                        color={(assignee ?? subtask.assignees[0]).avatarColor}
                        size="sm"
                      />
                      <span className="text-sm text-gray-600">
                        {(assignee ?? subtask.assignees[0]).name}
                      </span>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <CalendarDays className="h-4 w-4 text-gray-300" />
                    {formatDateVN(subtask.dueDate)}
                  </div>
                  {overdue && <OverdueTag className="mt-1" />}
                </td>
                <td className="px-3 py-4 align-top">
                  <ProgressBar value={subtask.progress} />
                </td>
                <td className="px-3 py-4 align-top">
                  <TaskPriorityBadge priority={subtask.priority} />
                </td>
                <td className="px-3 py-4 align-top">
                  <TaskStatusBadge status={subtask.status} />
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-center justify-end gap-2">
                    {subtask.status !== "done" && (
                      <Button size="sm" variant="secondary" onClick={() => onReport(subtask)}>
                        Báo cáo
                      </Button>
                    )}
                    <TaskActionMenu
                      onViewReports={() => onViewReports(subtask)}
                      onEdit={() => onEdit(subtask)}
                      onDelete={() => onDelete(subtask)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
