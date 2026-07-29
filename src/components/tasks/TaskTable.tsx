"use client";

import { CalendarDays } from "lucide-react";
import type { WorkTask } from "@/types/task";
import { isTaskOverdue } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { TaskActionMenu } from "@/components/tasks/TaskActionMenu";
import { formatDateVN } from "@/lib/utils";

interface TaskTableProps {
  tasks: WorkTask[];
  projectsById: Map<string, Project>;
  membersById: Map<string, ProjectMember>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenTask: (task: WorkTask) => void;
  /** Nút "Báo cáo": mở form gửi báo cáo tiến độ. */
  onReport: (task: WorkTask) => void;
  /** Menu "Lịch sử báo cáo": xem các báo cáo đã gửi. Mặc định dùng onReport. */
  onViewReports?: (task: WorkTask) => void;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  hideProjectColumn?: boolean;
  compactActions?: boolean;
}

export function TaskTable({
  tasks,
  projectsById,
  membersById,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenTask,
  onReport,
  onViewReports,
  onEdit,
  onDelete,
  hideProjectColumn = false,
  compactActions = false,
}: TaskTableProps) {
  const allSelected = tasks.length > 0 && selectedIds.length === tasks.length;

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${hideProjectColumn ? "min-w-[980px]" : "min-w-[1180px]"} border-collapse text-sm`}>
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
            <th className="px-3 py-3">Tên công việc</th>
            {!hideProjectColumn && <th className="px-3 py-3">Dự án</th>}
            <th className="px-3 py-3">Người phụ trách</th>
            <th className="px-3 py-3">Hạn hoàn thành</th>
            <th className="px-3 py-3">Tiến độ</th>
            <th className="px-3 py-3">Ưu tiên</th>
            <th className="px-3 py-3">Trạng thái</th>
            <th className="w-40 px-3 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => {
            const project = projectsById.get(task.projectId);
            const assignee = membersById.get(task.assigneeId);
            const overdue = isTaskOverdue(task);

            return (
              <tr key={task.id} className="group transition-colors hover:bg-gray-50/60">
                <td className="px-6 py-4 align-top">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(task.id)}
                    onChange={() => onToggleSelect(task.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label={`Chọn công việc ${task.title}`}
                  />
                </td>
                <td className="max-w-xs px-3 py-4 align-top">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="block truncate text-left text-sm font-semibold text-gray-800 hover:text-blue-600"
                  >
                    {task.title}
                  </button>
                  {task.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{task.description}</p>
                  )}
                </td>
                {!hideProjectColumn && (
                  <td className="px-3 py-4 align-top">
                    {project ? <Badge color={project.color}>{project.code}</Badge> : "--"}
                  </td>
                )}
                <td className="px-3 py-4 align-top">
                  {task.assignees.length > 1 ? (
                    <div className="flex items-center gap-2">
                      <AvatarStack people={task.assignees} max={3} />
                      <span className="text-sm text-gray-600">
                        {task.assignees.length} người
                      </span>
                    </div>
                  ) : assignee ?? task.assignees[0] ? (
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={(assignee ?? task.assignees[0]).name}
                        color={(assignee ?? task.assignees[0]).avatarColor}
                        size="sm"
                      />
                      <span className="text-sm text-gray-600">
                        {(assignee ?? task.assignees[0]).name}
                      </span>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <CalendarDays className="h-4 w-4 text-gray-300" />
                    {formatDateVN(task.dueDate)}
                  </div>
                  {overdue && <OverdueTag className="mt-1" />}
                </td>
                <td className="px-3 py-4 align-top">
                  <ProgressBar value={task.progress} />
                </td>
                <td className="px-3 py-4 align-top">
                  <TaskPriorityBadge priority={task.priority} />
                </td>
                <td className="px-3 py-4 align-top">
                  <TaskStatusBadge status={task.status} />
                </td>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-center justify-end gap-2">
                    {!compactActions && task.status !== "done" && (
                      <Button size="sm" variant="secondary" onClick={() => onReport(task)}>
                        Báo cáo
                      </Button>
                    )}
                    <TaskActionMenu
                      onViewReports={() => (onViewReports ?? onReport)(task)}
                      onEdit={() => onEdit(task)}
                      onDelete={() => onDelete(task)}
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
