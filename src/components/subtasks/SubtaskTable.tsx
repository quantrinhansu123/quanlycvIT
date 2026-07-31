"use client";

import { CalendarDays, CheckCircle2, FilePenLine, History, Pencil, Trash2 } from "lucide-react";
import type { Subtask } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { WorkTask } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import {
  subtaskColumnWidths,
  WORK_ITEM_PROGRESS_CLASS,
  WORK_ITEM_TABLE_CLASS,
  WORK_ITEM_TITLE_CLASS,
} from "@/components/ui/work-item-table-layout";
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
  /** Truyền vào để hiện thêm cột "Dự án" ngay sau cột "Thuộc công việc". */
  projectsById?: Map<string, Project>;
  /** Chỉ quản trị viên mới thấy thao tác Duyệt khi task đang chờ đánh giá. */
  canApprove?: boolean;
  onApprove?: (subtask: Subtask) => void;
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
  projectsById,
  canApprove = false,
  onApprove,
}: SubtaskTableProps) {
  const allSelected = subtasks.length > 0 && selectedIds.length === subtasks.length;
  const showProjectColumn = !hideWorkTaskColumn && Boolean(projectsById);
  const columnWidths = subtaskColumnWidths(hideWorkTaskColumn, showProjectColumn);

  return (
    <div className="min-w-0">
      <table
        className={`${WORK_ITEM_TABLE_CLASS} ${hideWorkTaskColumn ? "min-w-[820px]" : showProjectColumn ? "min-w-[980px]" : "min-w-[900px]"}`}
      >
        <colgroup>
          {columnWidths.map((width, index) => <col key={index} className={width} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-2 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                aria-label="Chọn tất cả"
              />
            </th>
            <th className="whitespace-nowrap px-2 py-3">Tên task</th>
            {!hideWorkTaskColumn && <th className="whitespace-nowrap px-2 py-3">Thuộc công việc</th>}
            {showProjectColumn && <th className="whitespace-nowrap px-2 py-3">Dự án</th>}
            <th className="whitespace-nowrap px-2 py-3">Người thực hiện</th>
            <th className="whitespace-nowrap px-2 py-3">Hạn hoàn thành</th>
            <th className="whitespace-nowrap px-2 py-3">Tiến độ</th>
            <th className="whitespace-nowrap px-2 py-3">Ưu tiên</th>
            <th className="whitespace-nowrap px-1.5 py-3">Trạng thái</th>
            <th className="whitespace-nowrap px-3 py-3 text-left">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {subtasks.map((subtask) => {
            const workTask = workTasksById.get(subtask.workTaskId);
            const assignee = membersById.get(subtask.assigneeId);
            const overdue = isSubtaskOverdue(subtask);

            return (
              <tr key={subtask.id} className="data-table-row group">
                <td className="px-2 py-3 align-top">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(subtask.id)}
                    onChange={() => onToggleSelect(subtask.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`Chọn task ${subtask.title}`}
                  />
                </td>
                <td className="min-w-0 px-2 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => onOpenSubtask(subtask)}
                    className={WORK_ITEM_TITLE_CLASS}
                  >
                    {subtask.title}
                  </button>
                  {subtask.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{subtask.description}</p>
                  )}
                </td>
                {!hideWorkTaskColumn && (
                  <td className="min-w-0 px-2 py-3 align-top">
                    <span className="block break-words text-xs text-gray-600">{workTask?.title ?? "--"}</span>
                  </td>
                )}
                {showProjectColumn && (
                  <td className="min-w-0 px-2 py-3 align-top">
                    <span className="block break-words text-xs text-gray-600">
                      {(workTask && projectsById?.get(workTask.projectId)?.name) ?? "--"}
                    </span>
                  </td>
                )}
                <td className="min-w-0 px-2 py-3 align-top">
                  {subtask.assignees.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <AvatarStack people={subtask.assignees} max={3} />
                      <span className="truncate text-xs text-gray-600">
                        {subtask.assignees.length} người
                      </span>
                    </div>
                  ) : assignee ?? subtask.assignees[0] ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Avatar
                        name={(assignee ?? subtask.assignees[0]).name}
                        color={(assignee ?? subtask.assignees[0]).avatarColor}
                        size="sm"
                      />
                      <span className="truncate text-xs text-gray-600">
                        {(assignee ?? subtask.assignees[0]).name}
                      </span>
                    </div>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-2 py-3 align-top">
                  <div className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-500">
                    <CalendarDays className="hidden h-3.5 w-3.5 shrink-0 text-gray-300 2xl:block" />
                    {formatDateVN(subtask.dueDate)}
                  </div>
                  {overdue && <OverdueTag className="mt-1" />}
                </td>
                <td className="px-2 py-3 align-top">
                  <ProgressBar value={subtask.progress} className={WORK_ITEM_PROGRESS_CLASS} />
                </td>
                <td className="px-2 py-3 align-top">
                  <TaskPriorityBadge priority={subtask.priority} className="px-1.5 py-0.5 text-[11px]" />
                </td>
                <td className="px-1.5 py-3 align-top">
                  <TaskStatusBadge status={subtask.status} className="px-1.5 py-0.5 text-[10px]" />
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex min-w-[152px] items-center justify-start gap-1.5">
                    {canApprove && subtask.status === "review" && subtask.progress === 100 && onApprove && (
                      <ActionIconButton
                        icon={CheckCircle2}
                        label="Duyệt task"
                        tone="success"
                        onClick={() => onApprove(subtask)}
                      />
                    )}
                    {subtask.status !== "done" && (
                      <ActionIconButton
                        icon={FilePenLine}
                        label="Báo cáo tiến độ"
                        onClick={() => onReport(subtask)}
                      />
                    )}
                    <ActionIconButton
                      icon={History}
                      label="Lịch sử báo cáo"
                      onClick={() => onViewReports(subtask)}
                    />
                    <ActionIconButton
                      icon={Pencil}
                      label="Chỉnh sửa"
                      tone="warning"
                      onClick={() => onEdit(subtask)}
                    />
                    <ActionIconButton
                      icon={Trash2}
                      label="Xóa task"
                      tone="danger"
                      onClick={() => onDelete(subtask)}
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
