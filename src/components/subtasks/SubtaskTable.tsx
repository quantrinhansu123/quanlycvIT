"use client";

import { Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Eye, FilePenLine, FolderOpen, History, ListTodo, Pencil, Trash2, XCircle } from "lucide-react";
import type { Subtask } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { WorkTaskDirectoryItem } from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TaskPriorityBadge, TaskStatusBadge, OverdueTag } from "@/components/tasks/TaskBadges";
import { RowActionMenu, type RowActionMenuItem } from "@/components/ui/RowActionMenu";
import { IntentPrefetchLink } from "@/components/navigation/IntentPrefetchLink";
import { useSplitView } from "@/components/layout/SplitViewShell";
import {
  subtaskColumnWidths,
  WORK_ITEM_PROGRESS_CLASS,
  WORK_ITEM_TABLE_CLASS,
  WORK_ITEM_TITLE_CLASS,
} from "@/components/ui/work-item-table-layout";
import { cn, formatDateVN } from "@/lib/utils";

interface SubtaskTableProps {
  subtasks: Subtask[];
  workTasksById: Map<string, WorkTaskDirectoryItem>;
  membersById: Map<string, ProjectMember>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onReport: (subtask: Subtask) => void;
  onViewReports: (subtask: Subtask) => void;
  onEdit: (subtask: Subtask) => void;
  onDelete: (subtask: Subtask) => void;
  hideWorkTaskColumn?: boolean;
  /** Truyền vào để hiện thêm cột "Dự án" ngay sau cột "Thuộc công việc". */
  projectsById?: Map<string, ProjectDirectoryItem>;
  /** Chỉ quản trị viên mới thấy thao tác Duyệt khi task đang chờ đánh giá. */
  canApprove?: boolean;
  onApprove?: (subtask: Subtask) => void;
  isMember?: boolean;
  currentAccountId?: string;
  acceptingId?: string | null;
  onAccept?: (subtask: Subtask) => void;
  canReport?: boolean;
  canTest?: boolean;
  onPassTest?: (subtask: Subtask) => void;
  onFailTest?: (subtask: Subtask) => void;
  readOnly?: boolean;
  /** Khi mở chi tiết: chỉ hiện checkbox + tên task. */
  compact?: boolean;
  /** Task đang xem chi tiết (để highlight trong chế độ compact). */
  activeId?: string;
  /** Xếp nhóm các dòng theo 2 cấp: Dự án → Công việc. Chỉ áp dụng ở chế độ bảng đầy đủ. */
  grouped?: boolean;
}

export interface SubtaskGroup {
  key: string;
  projectKey: string;
  projectId?: string;
  projectName: string;
  workTaskId: string;
  workTaskTitle: string;
  items: Subtask[];
}

/** Gom danh sách task phẳng thành các nhóm Dự án → Công việc, sắp xếp theo tên. */
export function buildSubtaskGroups(
  subtasks: Subtask[],
  workTasksById: Map<string, WorkTaskDirectoryItem>,
  projectsById?: Map<string, ProjectDirectoryItem>
): SubtaskGroup[] {
  const byKey = new Map<string, SubtaskGroup>();
  for (const subtask of subtasks) {
    const workTask = workTasksById.get(subtask.workTaskId);
    const projectId = workTask?.projectId;
    const projectKey = projectId ?? "__none";
    const key = `${projectKey}__${subtask.workTaskId}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        projectKey,
        projectId,
        projectName: (projectId && projectsById?.get(projectId)?.name) ?? "Không thuộc dự án",
        workTaskId: subtask.workTaskId,
        workTaskTitle: workTask?.title ?? "Công việc khác",
        items: [],
      };
      byKey.set(key, group);
    }
    group.items.push(subtask);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName, "vi") ||
      a.workTaskTitle.localeCompare(b.workTaskTitle, "vi")
  );
}

export function SubtaskTable({
  subtasks,
  workTasksById,
  membersById,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onReport,
  onViewReports,
  onEdit,
  onDelete,
  hideWorkTaskColumn = false,
  projectsById,
  canApprove = false,
  onApprove,
  isMember = false,
  currentAccountId,
  acceptingId,
  onAccept,
  canReport = true,
  canTest = false,
  onPassTest,
  onFailTest,
  readOnly = false,
  compact = false,
  activeId,
  grouped = false,
}: SubtaskTableProps) {
  const router = useRouter();
  const splitView = useSplitView();
  const selectableSubtasks = readOnly
    ? []
    : subtasks.filter((subtask) => subtask.status !== "done");
  const allSelected =
    selectableSubtasks.length > 0 &&
    selectableSubtasks.every((subtask) => selectedIds.includes(subtask.id));
  const showProjectColumn = !hideWorkTaskColumn && Boolean(projectsById);
  const columnWidths = compact
    ? ["w-10", "min-w-0"]
    : subtaskColumnWidths(hideWorkTaskColumn, showProjectColumn);
  const groupEnabled = grouped && !compact;
  const allGroups = useMemo(
    () => buildSubtaskGroups(subtasks, workTasksById, projectsById),
    [subtasks, workTasksById, projectsById]
  );
  const orderedSubtasks = useMemo(
    () => (groupEnabled ? allGroups.flatMap((group) => group.items) : subtasks),
    [groupEnabled, allGroups, subtasks]
  );
  const groupByKey = useMemo(() => new Map(allGroups.map((group) => [group.key, group])), [allGroups]);
  const groupKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of allGroups) {
      for (const item of group.items) map.set(item.id, group.key);
    }
    return map;
  }, [allGroups]);
  // Số cột của tbody để dòng tiêu đề nhóm trải full bảng.
  const bodyColumnCount = compact ? 2 : 9 + (!hideWorkTaskColumn ? 1 : 0) + (showProjectColumn ? 1 : 0);
  function projectTaskCount(projectKey: string): number {
    return allGroups
      .filter((group) => group.projectKey === projectKey)
      .reduce((sum, group) => sum + group.items.length, 0);
  }

  return (
    <div className="min-w-0">
      <table
        className={cn(
          WORK_ITEM_TABLE_CLASS,
          compact
            ? "min-w-0"
            : hideWorkTaskColumn
              ? "min-w-[760px]"
              : showProjectColumn
                ? "min-w-[920px]"
                : "min-w-[840px]"
        )}
      >
        <colgroup>
          {columnWidths.map((width, index) => <col key={index} className={width} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <th className={cn("px-2", compact ? "py-2" : "py-3")}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                disabled={selectableSubtasks.length === 0}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                aria-label="Chọn tất cả"
              />
            </th>
            <th className={cn("whitespace-nowrap px-2", compact ? "py-2" : "py-3")}>Tên task</th>
            {!compact && (
              <>
                {!hideWorkTaskColumn && <th className="whitespace-nowrap px-2 py-3">Thuộc công việc</th>}
                {showProjectColumn && <th className="whitespace-nowrap px-2 py-3">Dự án</th>}
                <th className="whitespace-nowrap px-2 py-3">Người thực hiện</th>
                <th className="whitespace-nowrap px-2 py-3">Người tạo</th>
                <th className="whitespace-nowrap px-2 py-3">Hạn hoàn thành</th>
                <th className="whitespace-nowrap px-2 py-3">Tiến độ</th>
                <th className="whitespace-nowrap px-2 py-3">Ưu tiên</th>
                <th className="whitespace-nowrap px-1.5 py-3">Trạng thái</th>
                <th className="whitespace-nowrap px-1 py-3 text-center">Thao tác</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orderedSubtasks.map((subtask, rowIndex) => {
            const workTask = workTasksById.get(subtask.workTaskId);
            const assignee = membersById.get(subtask.assigneeId);
            const overdue = isSubtaskOverdue(subtask);
            const rowReadOnly = readOnly || subtask.status === "done";
            const isActive = activeId === subtask.id;
            const needsAcceptance = Boolean(
              isMember &&
              currentAccountId &&
              currentAccountId !== subtask.testerId &&
              !subtask.acceptedAssigneeIds.includes(currentAccountId)
            );
            const actionItems: RowActionMenuItem[] = [
              {
                icon: Eye,
                label: "Xem chi tiết",
                onClick: () => {
                  splitView?.openDetail();
                  router.push(`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`);
                },
              },
              ...(rowReadOnly
                ? [{
                    icon: History,
                    label: "Lịch sử báo cáo",
                    onClick: () => onViewReports(subtask),
                  }]
                : needsAcceptance && onAccept
                ? [{
                    icon: CheckCircle2,
                    label: "Xác nhận nhận Task",
                    tone: "success" as const,
                    disabled: acceptingId === subtask.id,
                    onClick: () => onAccept(subtask),
                  }]
                : [
                    ...(canTest && subtask.status === "testing" &&
                    (canApprove || currentAccountId === subtask.testerId)
                      ? [
                          ...(onPassTest ? [{ icon: CheckCircle2, label: "Pass kiểm thử", tone: "success" as const, onClick: () => onPassTest(subtask) }] : []),
                          ...(onFailTest ? [{ icon: XCircle, label: "Fail kiểm thử", tone: "danger" as const, onClick: () => onFailTest(subtask) }] : []),
                        ]
                      : []),
                    ...(canApprove && subtask.status === "review" && subtask.progress === 100 && onApprove
                      ? [{
                          icon: CheckCircle2,
                          label: "Duyệt task",
                          tone: "success" as const,
                          onClick: () => onApprove(subtask),
                        }]
                      : []),
                    ...(canReport && (subtask.status === "todo" || subtask.status === "inProgress")
                      ? [{
                          icon: FilePenLine,
                          label: "Báo cáo tiến độ",
                          onClick: () => onReport(subtask),
                        }]
                      : []),
                    {
                      icon: History,
                      label: "Lịch sử báo cáo",
                      onClick: () => onViewReports(subtask),
                    },
                    {
                      icon: Pencil,
                      label: "Chỉnh sửa",
                      tone: "primary" as const,
                      onClick: () => onEdit(subtask),
                    },
                    {
                      icon: Trash2,
                      label: "Xóa task",
                      tone: "danger" as const,
                      onClick: () => onDelete(subtask),
                    },
                  ]),
            ];

            return (
              <Fragment key={subtask.id}>
                {(() => {
                  if (!groupEnabled) return null;
                  const group = groupByKey.get(groupKeyById.get(subtask.id) ?? "");
                  if (!group) return null;
                  const prevSubtask = rowIndex > 0 ? orderedSubtasks[rowIndex - 1] : undefined;
                  const prevGroup = prevSubtask ? groupByKey.get(groupKeyById.get(prevSubtask.id) ?? "") : undefined;
                  if (prevGroup?.key === group.key) return null;
                  const showProject = prevGroup?.projectKey !== group.projectKey;
                  return (
                    <>
                      {showProject && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={bodyColumnCount} className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-4 w-4 shrink-0 text-brand-600" />
                              <span className="truncate text-xs font-bold uppercase tracking-wide text-gray-700">
                                {group.projectName}
                              </span>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200">
                                {projectTaskCount(group.projectKey)} task
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="bg-white">
                        <td colSpan={bodyColumnCount} className="px-2 py-1.5 pl-7">
                          <div className="flex items-center gap-1.5">
                            <ListTodo className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="truncate text-xs font-semibold text-gray-600">
                              {group.workTaskTitle}
                            </span>
                            <span className="whitespace-nowrap text-[10px] font-medium text-gray-400">
                              · {group.items.length} task
                            </span>
                          </div>
                        </td>
                      </tr>
                    </>
                  );
                })()}
              <tr
                className={cn(
                  "data-table-row group",
                  isActive && "bg-brand-50/70"
                )}
              >
                <td className={cn("px-2 align-middle", compact ? "py-1.5" : "py-3 align-top")}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(subtask.id)}
                    onChange={() => onToggleSelect(subtask.id)}
                    disabled={rowReadOnly}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`Chọn task ${subtask.title}`}
                  />
                </td>
                <td className={cn("min-w-0 px-2", compact ? "py-1.5 align-middle" : "py-3 align-top")}>
                  <IntentPrefetchLink
                    href={`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`}
                    className={cn(WORK_ITEM_TITLE_CLASS, "line-clamp-2")}
                    onClick={() => splitView?.openDetail()}
                  >
                    {subtask.title}
                  </IntentPrefetchLink>
                  {compact && (
                    <div className="mt-1">
                      <ProgressBar value={subtask.progress} className="min-w-0 flex-1" />
                    </div>
                  )}
                  {!compact && subtask.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-400">{subtask.description}</p>
                  )}
                </td>
                {!compact && (
                  <>
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
                        <div
                          className="flex min-w-0 cursor-pointer items-center"
                          title={subtask.assignees.map((member) => member.name).join(", ")}
                          aria-label={`Người thực hiện: ${subtask.assignees.map((member) => member.name).join(", ")}`}
                        >
                          <AvatarStack people={subtask.assignees} max={3} />
                        </div>
                      ) : assignee ?? subtask.assignees[0] ? (
                        <div className="flex min-w-0 items-center">
                          <Avatar
                            name={(assignee ?? subtask.assignees[0]).name}
                            color={(assignee ?? subtask.assignees[0]).avatarColor}
                            size="sm"
                            className="cursor-pointer"
                          />
                        </div>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-2 py-3 align-top">
                      {subtask.creator ? (
                        <Avatar
                          name={subtask.creator.name}
                          color={subtask.creator.avatarColor}
                          size="sm"
                          className="cursor-pointer"
                        />
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
                      <TaskPriorityBadge priority={subtask.priority} className="px-1.5 py-0.5 text-[10px]" />
                    </td>
                    <td className="px-1.5 py-3 align-top">
                      <TaskStatusBadge status={subtask.status} className="px-1.5 py-0.5 text-[10px]" />
                    </td>
                    <td className="px-1 py-3 text-center align-top">
                      <div className="inline-flex">
                        <RowActionMenu
                          label={`Thao tác Task ${subtask.title}`}
                          items={actionItems}
                        />
                      </div>
                    </td>
                  </>
                )}
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
