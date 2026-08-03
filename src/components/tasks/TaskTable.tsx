"use client";

import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import type { WorkTask } from "@/types/task";
import { isTaskOverdue } from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink";
import {
  taskColumnWidths,
  WORK_ITEM_PROGRESS_CLASS,
  WORK_ITEM_TABLE_CLASS,
  WORK_ITEM_TITLE_CLASS,
} from "@/components/ui/work-item-table-layout";
import { formatDateVN } from "@/lib/utils";

interface TaskTableProps {
  tasks: WorkTask[];
  projectsById: Map<string, ProjectDirectoryItem>;
  membersById: Map<string, ProjectMember>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  hideProjectColumn?: boolean;
  readOnly?: boolean;
}

export function TaskTable({
  tasks,
  projectsById,
  membersById,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
  hideProjectColumn = false,
  readOnly = false,
}: TaskTableProps) {
  const allSelected = tasks.length > 0 && selectedIds.length === tasks.length;
  const columnWidths = taskColumnWidths(hideProjectColumn, readOnly);

  return (
    <div className="min-w-0">
      <table
        className={`${WORK_ITEM_TABLE_CLASS} ${hideProjectColumn ? "min-w-[760px]" : "min-w-[840px]"}`}
      >
        <colgroup>
          {columnWidths.map((width, index) => <col key={index} className={width} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {!readOnly && <th className="px-2 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                aria-label="Chọn tất cả"
              />
            </th>}
            <th className="whitespace-nowrap px-2 py-3">Tên công việc</th>
            {!hideProjectColumn && <th className="whitespace-nowrap px-2 py-3">Dự án</th>}
            <th className="whitespace-nowrap px-2 py-3">Người phụ trách</th>
            <th className="whitespace-nowrap px-2 py-3">Hạn hoàn thành</th>
            <th className="whitespace-nowrap px-2 py-3">Tiến độ</th>
            <th className="whitespace-nowrap px-2 py-3">Ưu tiên</th>
            <th className="whitespace-nowrap px-2 py-3">Trạng thái</th>
            {!readOnly && <th className="whitespace-nowrap px-2 py-3 text-left">Thao tác</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => {
            const project = projectsById.get(task.projectId);
            const assignee = membersById.get(task.assigneeId);
            const overdue = isTaskOverdue(task);

            return (
              <tr key={task.id} className="data-table-row group">
                {!readOnly && <td className="px-2 py-3 align-top">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(task.id)}
                    onChange={() => onToggleSelect(task.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`Chọn công việc ${task.title}`}
                  />
                </td>}
                <td className="min-w-0 px-2 py-3 align-top">
                  <IntentPrefetchLink
                    href={`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`}
                    className={WORK_ITEM_TITLE_CLASS}
                  >
                    {task.title}
                  </IntentPrefetchLink>
                  {task.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{task.description}</p>
                  )}
                </td>
                {!hideProjectColumn && (
                  <td className="min-w-0 px-2 py-3 align-top">
                    {project ? (
                      <span className="block whitespace-normal break-words text-xs leading-4 text-gray-700">
                        {project.name}
                      </span>
                    ) : "--"}
                  </td>
                )}
                <td className="min-w-0 px-2 py-3 align-top">
                  {task.assignees.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <AvatarStack people={task.assignees} max={3} />
                      <span className="truncate text-xs text-gray-600">
                        {task.assignees.length} người
                      </span>
                    </div>
                  ) : assignee ?? task.assignees[0] ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Avatar
                        name={(assignee ?? task.assignees[0]).name}
                        color={(assignee ?? task.assignees[0]).avatarColor}
                        size="sm"
                      />
                      <span className="truncate text-xs text-gray-600">
                        {(assignee ?? task.assignees[0]).name}
                      </span>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-2 py-3 align-top">
                  <div className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                    <CalendarDays className="hidden h-3.5 w-3.5 shrink-0 text-gray-300 2xl:block" />
                    {formatDateVN(task.dueDate)}
                  </div>
                  {overdue && <OverdueTag className="mt-1" />}
                </td>
                <td className="px-2 py-3 align-top">
                  <ProgressBar value={task.progress} className={WORK_ITEM_PROGRESS_CLASS} />
                </td>
                <td className="px-2 py-3 align-top">
                  <TaskPriorityBadge priority={task.priority} className="px-1.5 py-0.5 text-[11px]" />
                </td>
                <td className="px-2 py-3 align-top">
                  <TaskStatusBadge status={task.status} className="px-1.5 py-0.5 text-[11px]" />
                </td>
                {!readOnly && <td className="px-2 py-3 align-top">
                  <div className="flex items-center justify-start gap-1">
                    <ActionIconButton
                      icon={Pencil}
                      label="Chỉnh sửa"
                      tone="warning"
                      onClick={() => onEdit(task)}
                    />
                    <ActionIconButton
                      icon={Trash2}
                      label="Xóa công việc"
                      tone="danger"
                      onClick={() => onDelete(task)}
                    />
                  </div>
                </td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
