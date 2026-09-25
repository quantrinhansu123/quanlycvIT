"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileClock,
  Flag,
  History,
  Info,
  ListTodo,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Pencil,
  RotateCcw,
  Trash2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import { subtaskService } from "@/services/subtask-service";
import type { Project, ProjectMember } from "@/types/project";
import type { Subtask } from "@/types/subtask";
import type { TaskFileAttachment, TaskLinkAttachment, TaskReport, WorkTask } from "@/types/task";
import {
  TASK_PRIORITY_OPTIONS,
  isTaskOverdue,
} from "@/types/task";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { ProgressReportItem } from "@/components/tasks/ProgressReportItem";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { WorkTaskSubtasksPanel } from "@/components/subtasks/WorkTaskSubtasksPanel";
import { ActivityTimeline } from "@/components/timeline/ActivityTimeline";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { DetailAttachments } from "@/components/tasks/DetailAttachments";
import { InlineTaskAttachmentEditor } from "@/components/tasks/InlineTaskAttachmentEditor";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/tasks/TaskBadges";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { useSplitView } from "@/components/layout/SplitViewShell";

const TaskFormModal = dynamic(
  () => import("@/components/tasks/TaskFormModal").then((mod) => mod.TaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type Tab = "info" | "tasks" | "reports";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDayDistance(date: string): number {
  const target = new Date(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS);
}

interface TaskDetailViewProps {
  taskId: string;
  initialTask: WorkTask | null;
  initialProjects: Project[];
  initialReports: TaskReport[];
  initialAllTasks: WorkTask[];
  initialSubtasks: Subtask[];
  initialMembers: ProjectMember[];
  readOnly: boolean;
}

export function TaskDetailView({
  taskId,
  initialTask,
  initialProjects,
  initialReports,
  initialAllTasks,
  initialSubtasks,
  initialMembers,
  readOnly,
}: TaskDetailViewProps) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const cache = useSessionDataCache();
  const splitView = useSplitView();
  const [task, setTask] = useState<WorkTask | null>(initialTask);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [allTasks, setAllTasks] = useState<WorkTask[]>(initialAllTasks);
  const [reports, setReports] = useState<TaskReport[]>(initialReports);
  const [subtasks, setSubtasks] = useState<Subtask[]>(initialSubtasks);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [quickUpdating, setQuickUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, projectData, reportData, taskList, subtaskList, memberData] =
        await Promise.all([
          taskService.getTaskById(taskId),
          projectService.getProjects(),
          taskService.getTaskReports(taskId),
          taskService.getTasks(),
          subtaskService.getSubtasksByWorkTask(taskId),
          projectService.getDirectory(),
        ]);
      setTask(taskData);
      setProjects(projectData);
      setReports(reportData);
      setAllTasks(taskList);
      setSubtasks(subtaskList);
      setMembers(memberData);
      setError(false);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải chi tiết công việc",
        description: getErrorMessage(
          loadError,
          "Vui lòng kiểm tra kết nối và thử lại."
        ),
      });
    }
  }, [taskId, notify]);

  const handleAttachmentSave = useCallback(async (value: {
    files: TaskFileAttachment[];
    links: TaskLinkAttachment[];
    images: string[];
  }) => {
    if (!task || readOnly || task.status === "done") return;
    try {
      const updated = await taskService.updateTask(task.id, {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        assigneeIds: task.assignees.map((member) => member.id),
        status: task.status,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        progress: task.progress,
        tags: task.tags,
        dependsOnTaskId: task.dependsOnTaskId,
        files: value.files,
        links: value.links,
        images: value.images,
      });
      if (!updated) throw new Error("Công việc không tồn tại hoặc đã bị xóa.");
      setTask(updated);
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu công việc",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [notify, readOnly, task]);

  async function handleQuickUpdate(
    patch: Partial<Pick<WorkTask, "priority">> & {
      assigneeIds?: string[];
    }
  ) {
    if (!task || readOnly || task.status === "done" || quickUpdating) return;
    setQuickUpdating(true);
    try {
      const updated = await taskService.updateTask(task.id, {
        title: task.title,
        description: task.description,
        projectId: task.projectId,
        assigneeIds: task.assignees.map((member) => member.id),
        status: task.status,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        progress: task.progress,
        tags: task.tags,
        dependsOnTaskId: task.dependsOnTaskId,
        files: task.files,
        links: task.links,
        images: task.images,
        ...patch,
      });
      if (!updated) {
        throw new Error("Công việc không tồn tại hoặc đã bị xóa.");
      }
      setTask(updated);
      notify({ type: "success", title: "Đã cập nhật công việc" });
      // Đổi ưu tiên/người phụ trách nhanh không đi qua load() nên phải tự xóa
      // cache list công việc + directory phụ thuộc (dropdown "tiền đề" ở trang khác).
      cache.invalidate(CACHE_RESOURCE.tasksList);
      cache.invalidate(CACHE_RESOURCE.directoryTasks);
    } catch (updateError) {
      notify({
        type: "error",
        title: "Cập nhật công việc thất bại",
        description: getErrorMessage(
          updateError,
          "Không thể cập nhật nhanh công việc."
        ),
      });
    } finally {
      setQuickUpdating(false);
    }
  }

  async function handleDelete() {
    if (!task || readOnly || deleting) return;
    const confirmed = await confirm({
      title: "Xóa công việc?",
      description: `Công việc “${task.title}” và các task trực thuộc sẽ bị xóa. Hành động này không thể hoàn tác.`,
      confirmLabel: "Xóa công việc",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const deleted = await taskService.deleteTask(task.id);
      if (!deleted) throw new Error("Công việc không tồn tại hoặc đã được xóa trước đó.");
      cache.invalidate(CACHE_RESOURCE.tasksList);
      cache.invalidate(CACHE_RESOURCE.directoryTasks);
      cache.invalidate(CACHE_RESOURCE.projectsList);
      notify({
        type: "success",
        title: "Đã xóa công việc",
        description: `Công việc “${task.title}” đã được xóa.`,
      });
      router.push("/quan-ly-cong-viec/danh-sach-cong-viec");
    } catch (deleteError) {
      notify({
        type: "error",
        title: "Xóa công việc thất bại",
        description: getErrorMessage(deleteError, "Không thể xóa công việc. Vui lòng thử lại."),
      });
    } finally {
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 @sm/detail:px-6">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (task === null) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 @sm/detail:px-6">
        <EmptyState
          icon={AlertCircle}
          title="Không tìm thấy công việc"
          description="Công việc có thể đã bị xóa."
        />
      </div>
    );
  }

  const project = projects.find((item) => item.id === task.projectId);
  const projectParticipants = project
    ? [...project.managers, ...project.members].filter(
        (member, index, list) =>
          list.findIndex((item) => item.id === member.id) === index
      )
    : [];
  const dependsOnTask = task.dependsOnTaskId
    ? allTasks.find((item) => item.id === task.dependsOnTaskId)
    : undefined;
  const dueDistance = getDayDistance(task.dueDate);
  const overdue = isTaskOverdue(task);
  const viewOnly = readOnly || task.status === "done";

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-white [contain:inline-size]">
      <div className="shrink-0 border-b border-gray-100 bg-white">
        <div className="mx-auto flex w-full min-w-0 max-w-full flex-wrap items-start justify-between gap-3 px-3 py-3 @sm/detail:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {splitView && !splitView.maximized ? (
              <>
                <button
                  type="button"
                  onClick={splitView.toggleDetailCollapsed}
                  className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:flex"
                  aria-label="Thu panel chi tiết"
                  title="Thu panel chi tiết"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:hidden"
                  aria-label="Quay lại"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                aria-label="Quay lại"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs leading-4 text-gray-400 @xl/detail:text-sm @xl/detail:leading-5">
              <Link
                href="/quan-ly-cong-viec/danh-sach-cong-viec"
                className="shrink-0 font-semibold text-gray-600 hover:text-brand-600"
              >
                Quản lý công việc
              </Link>
              {project && (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">&gt;</span>
                  <Link
                    href={`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`}
                    className="min-w-0 break-words font-semibold text-gray-500 hover:text-brand-600"
                  >
                    Dự án {project.name}
                  </Link>
                </span>
              )}
              <span className="flex min-w-0 items-start gap-2">
                <span className="shrink-0">&gt;</span>
                <span className="min-w-0 break-words font-semibold text-gray-500">
                  {task.title}
                </span>
              </span>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {task.status === "done" && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                <CircleCheck className="h-4 w-4" />
                Chỉ xem
              </span>
            )}
            {splitView && (
              <button
                type="button"
                onClick={splitView.toggleMaximized}
                className="hidden h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:flex"
                aria-label={splitView.maximized ? "Thu nhỏ về chia đôi màn hình" : "Phóng to toàn màn hình"}
                title={splitView.maximized ? "Thu nhỏ về chia đôi màn hình" : "Phóng to toàn màn hình"}
              >
                {splitView.maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            {!viewOnly && (
              <Button
                onClick={() => setEditing(true)}
                className="rounded-full bg-brand-600 hover:bg-brand-700"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden @xl/detail:inline">Chỉnh sửa</span>
              </Button>
            )}
            {!readOnly && (
              <Button
                variant="secondary"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-full border-rose-200 text-rose-600 ring-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden @xl/detail:inline">Xóa</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto min-h-0 w-full flex-1",
          tab === "tasks"
            ? "max-w-none overflow-hidden px-3 pb-3 pt-3 @sm/detail:px-5"
            : "max-w-none overflow-y-auto px-3 pb-8 pt-4 @sm/detail:px-5"
        )}
      >
        {tab === "info" ? (
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 @md/detail:grid-cols-2 @5xl/detail:grid-cols-4">
              <OverviewCard
                label="Tiến độ thực tế"
                icon={CircleCheck}
                iconClassName="bg-violet-50 text-violet-600"
              >
                <div className="flex items-end justify-between gap-3">
                  <strong className="text-2xl font-bold text-gray-950">
                    {task.progress}%
                  </strong>
                </div>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </OverviewCard>

              <OverviewCard
                label="Hạn hoàn thành"
                icon={Clock3}
                iconClassName="bg-rose-50 text-rose-600"
              >
                <p
                  className={cn(
                    "text-sm font-bold",
                    overdue ? "text-rose-500" : "text-gray-900"
                  )}
                >
                  {overdue
                    ? `Trễ hạn ${Math.abs(dueDistance)} ngày`
                    : dueDistance === 0
                      ? "Hạn hôm nay"
                      : `Còn ${dueDistance} ngày`}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {formatDateVN(task.dueDate)}
                </p>
              </OverviewCard>

              <OverviewCard
                label="Mức độ ưu tiên"
                icon={Flag}
                iconClassName="bg-orange-50 text-orange-500"
              >
                {viewOnly ? (
                  <TaskPriorityBadge priority={task.priority} />
                ) : (
                  <QuickSelect
                    value={task.priority}
                    disabled={quickUpdating}
                    options={TASK_PRIORITY_OPTIONS}
                    onChange={(value) =>
                      handleQuickUpdate({ priority: value as WorkTask["priority"] })
                    }
                  />
                )}
              </OverviewCard>

              <OverviewCard
                label="Trạng thái"
                icon={CircleAlert}
                iconClassName="bg-teal-50 text-teal-600"
              >
                <TaskStatusBadge status={task.status} />
                <p className="mt-2 text-[11px] text-gray-400">
                  Tự động theo trạng thái các Task
                </p>
              </OverviewCard>
            </section>

            <section className="grid grid-cols-1 gap-5 @3xl/detail:grid-cols-3">
              <Panel
                className="@3xl/detail:col-span-2"
                accentClassName="bg-violet-600"
                icon={Info}
                iconClassName="text-violet-600"
                title="Chi tiết công việc"
                subtitle="Mô tả công việc và thời hạn thực hiện chi tiết"
              >
                <div className="max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-sm leading-6 text-gray-700">
                  <DetailDescription
                    description={task.description}
                    emptyText="Chưa có mô tả cho công việc này."
                  />
                </div>
                {viewOnly ? (
                  <DetailAttachments
                    entityLabel="công việc"
                    files={task.files}
                    links={task.links}
                    images={task.images}
                  />
                ) : (
                  <InlineTaskAttachmentEditor
                    key={task.id}
                    entityLabel="công việc"
                    files={task.files}
                    links={task.links}
                    images={task.images}
                    onUploadFile={taskService.uploadFile}
                    onUploadImage={taskService.uploadImage}
                    onSave={handleAttachmentSave}
                  />
                )}
                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-gray-100 pt-4 @md/detail:grid-cols-2">
                  <DateInfo
                    label="Thời gian bắt đầu:"
                    value={formatDateVN(task.startDate)}
                    icon={CalendarDays}
                  />
                  <DateInfo
                    label="Hạn hoàn thành:"
                    value={formatDateVN(task.dueDate)}
                    icon={Clock3}
                  />
                </div>
              </Panel>

              <Panel
                accentClassName="bg-violet-600"
                icon={UsersRound}
                iconClassName="text-violet-600"
                title="Nhân sự & Dự án"
                subtitle="Người thực thi chính và dự án trực thuộc"
              >
                <p className="mb-2 text-xs font-medium text-gray-400">
                  Nhân sự phụ trách:
                </p>
                <MemberMultiSelect
                  options={projectParticipants}
                  value={task.assignees.map((member) => member.id)}
                  onChange={(ids) => {
                    if (ids.length > 0) handleQuickUpdate({ assigneeIds: ids });
                  }}
                  emptyHint="Dự án chưa có thành viên"
                  disabled={viewOnly || quickUpdating}
                />

                <p className="mb-2 mt-5 text-xs font-medium text-gray-400">
                  Dự án liên kết:
                </p>
                {project ? (
                  <Link
                    href={`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3 transition-colors hover:bg-gray-100"
                  >
                    <Badge color={project.color}>{project.code}</Badge>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-gray-900">
                        {project.name}
                      </span>
                      <span className="block text-xs text-gray-400">
                        Hạn: {formatDateVN(project.endDate)}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <p className="text-sm text-gray-400">Không xác định</p>
                )}

                {task.assignees.length > 1 && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                    <AvatarStack people={task.assignees} max={4} />
                    {task.assignees.length} người phụ trách
                  </div>
                )}
              </Panel>
            </section>

            <section className="grid grid-cols-1 gap-5 @3xl/detail:grid-cols-3">
              <Panel
                accentClassName="bg-orange-500"
                icon={CircleAlert}
                iconClassName="text-orange-500"
                title="Công việc tiền đề"
                subtitle="Các công việc cần làm xong trước khi bắt đầu"
              >
                <div className="flex min-h-36 items-center justify-center text-center">
                  {dependsOnTask ? (
                    <Link
                      href={`/quan-ly-cong-viec/danh-sach-cong-viec/${dependsOnTask.id}`}
                      className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                    >
                      {dependsOnTask.title}
                    </Link>
                  ) : (
                    <p className="text-sm italic text-gray-400">
                      Không yêu cầu công việc tiền đề
                    </p>
                  )}
                </div>
              </Panel>

              <Panel
                className="@3xl/detail:col-span-2"
                accentClassName="bg-emerald-500"
                icon={RotateCcw}
                iconClassName="text-emerald-500"
                title="Timeline hoạt động công việc"
                subtitle="Danh sách Task của công việc theo thứ tự cập nhật"
              >
                <ActivityTimeline
                  itemLabel="Task"
                  items={subtasks.map((item) => ({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    href: `/quan-ly-cong-viec/danh-sach-task/${item.id}`,
                    status: item.status,
                    priority: item.priority,
                    assignees: item.assignees,
                    startDate: item.startDate,
                    dueDate: item.dueDate,
                    progress: item.progress,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                  }))}
                  emptyTitle="Công việc chưa có Task"
                  emptyDescription="Khi thêm Task vào công việc, các Task sẽ được liệt kê tại timeline này."
                />
              </Panel>
            </section>
          </div>
        ) : tab === "tasks" ? (
          <WorkTaskSubtasksPanel
            workTask={task}
            projects={project ? [project] : []}
            members={members}
            onSubtasksChanged={load}
            readOnly={viewOnly}
          />
        ) : (
          <section className="min-h-[520px] rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <History className="h-4 w-4 text-violet-600" />
                  Lịch sử báo cáo
                </h2>
                <p className="mt-1 text-xs text-gray-400">
                  Các báo cáo tiến độ đã gửi cho công việc
                </p>
              </div>
            </div>
            {reports.length === 0 ? (
              <EmptyState
                icon={FileClock}
                title="Chưa có báo cáo nào"
                description="Báo cáo tiến độ công việc sẽ được liệt kê tại đây."
              />
            ) : (
              <ul className="space-y-3">
                {reports.map((report) => (
                  <ProgressReportItem key={report.id} report={report} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="z-20 shrink-0 border-t border-gray-200 bg-white px-4 py-2">
        <div className="mx-auto flex w-full max-w-none gap-2">
          <BottomTab
            active={tab === "info"}
            onClick={() => setTab("info")}
            icon={Info}
            label="Thông tin công việc"
          />
          <BottomTab
            active={tab === "tasks"}
            onClick={() => setTab("tasks")}
            icon={ListTodo}
            label="Task"
            count={subtasks.length}
          />
          <BottomTab
            active={tab === "reports"}
            onClick={() => setTab("reports")}
            icon={History}
            label="Lịch sử báo cáo"
            count={reports.length}
          />
        </div>
      </div>

      {editing && !viewOnly && (
        <TaskFormModal
          mode="edit"
          task={task}
          projects={projects}
          members={members}
          otherTasks={allTasks}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
            // Sửa công việc có thể đổi dự án/tiến độ/tên — xóa cache list công việc,
            // directory phụ thuộc, và list dự án (thẻ dự án hiển thị stats.total/done).
            cache.invalidate(CACHE_RESOURCE.tasksList);
            cache.invalidate(CACHE_RESOURCE.directoryTasks);
            cache.invalidate(CACHE_RESOURCE.projectsList);
          }}
        />
      )}
    </div>
  );
}

function DetailDescription({
  description,
  emptyText,
}: {
  description?: string;
  emptyText: string;
}) {
  if (!description) {
    return <p>{emptyText}</p>;
  }

  return (
    <p className="min-w-full whitespace-pre-wrap break-words">
      {description.split(/(https?:\/\/\S+)/g).map((part, index) =>
        /^https?:\/\/\S+$/.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-brand-600 underline-offset-2 hover:underline"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  );
}

function OverviewCard({
  label,
  icon: Icon,
  iconClassName,
  children,
}: {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative min-h-32 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <div className="mt-2 pr-12">{children}</div>
      <span
        className={cn(
          "absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
          iconClassName
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
    </article>
  );
}

function QuickSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 max-w-full rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  accentClassName,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconClassName: string;
  accentClassName: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm",
        className
      )}
    >
      <div className={cn("h-1", accentClassName)} />
      <div className="p-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Icon className={cn("h-4 w-4", iconClassName)} />
          {title}
        </h2>
        <p className="mb-7 mt-2 text-xs text-gray-500">{subtitle}</p>
        {children}
      </div>
    </article>
  );
}

function DateInfo({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-bold text-gray-900">
        <Icon className="h-4 w-4 text-violet-600" />
        {value}
      </p>
    </div>
  );
}

function BottomTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-5",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
