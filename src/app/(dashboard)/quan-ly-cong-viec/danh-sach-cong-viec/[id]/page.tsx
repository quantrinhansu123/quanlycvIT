"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Pencil,
  RotateCcw,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import { subtaskService } from "@/services/subtask-service";
import type { Project, ProjectMember } from "@/types/project";
import type { Subtask } from "@/types/subtask";
import type { TaskReport, WorkTask } from "@/types/task";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  isTaskOverdue,
} from "@/types/task";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { ProgressReportItem } from "@/components/tasks/ProgressReportItem";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { WorkTaskSubtasksPanel } from "@/components/subtasks/WorkTaskSubtasksPanel";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type Tab = "info" | "tasks" | "reports";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDayDistance(date: string): number {
  const target = new Date(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS);
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useFeedback();
  const [task, setTask] = useState<WorkTask | null | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<WorkTask[]>([]);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [quickUpdating, setQuickUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, projectData, reportData, taskList, subtaskList, memberData] =
        await Promise.all([
          taskService.getTaskById(id),
          projectService.getProjects(),
          taskService.getTaskReports(id),
          taskService.getTasks(),
          subtaskService.getSubtasksByWorkTask(id),
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
  }, [id, notify]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleQuickUpdate(
    patch: Partial<Pick<WorkTask, "status" | "priority">> & {
      assigneeIds?: string[];
    }
  ) {
    if (!task || quickUpdating) return;
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
        ...patch,
      });
      if (!updated) {
        throw new Error("Công việc không tồn tại hoặc đã bị xóa.");
      }
      setTask(updated);
      notify({ type: "success", title: "Đã cập nhật công việc" });
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

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (task === undefined) {
    return (
      <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-6 sm:px-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (task === null) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
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

  return (
    <div className="min-h-full bg-white pb-2">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
              aria-label="Quay lại"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <nav className="flex min-w-0 items-center gap-2 text-sm text-gray-400">
              <Link
                href="/quan-ly-cong-viec/danh-sach-cong-viec"
                className="shrink-0 font-semibold text-gray-600 hover:text-blue-600"
              >
                Quản lý công việc
              </Link>
              <span>&gt;</span>
              {project && (
                <>
                  <Link
                    href={`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`}
                    className="shrink-0 font-semibold text-gray-500 hover:text-blue-600"
                  >
                    Dự án {project.name}
                  </Link>
                  <span>&gt;</span>
                </>
              )}
              <span className="truncate font-semibold text-gray-500">{task.title}</span>
            </nav>
          </div>

          <Button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full bg-blue-600 hover:bg-blue-700"
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">Chỉnh sửa công việc</span>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pb-8 pt-6 sm:px-6">
        {tab === "info" ? (
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                <QuickSelect
                  value={task.priority}
                  disabled={quickUpdating}
                  options={TASK_PRIORITY_OPTIONS}
                  onChange={(value) =>
                    handleQuickUpdate({ priority: value as WorkTask["priority"] })
                  }
                />
              </OverviewCard>

              <OverviewCard
                label="Trạng thái"
                icon={CircleAlert}
                iconClassName="bg-teal-50 text-teal-600"
              >
                <QuickSelect
                  value={task.status}
                  disabled={quickUpdating}
                  options={TASK_STATUS_OPTIONS}
                  onChange={(value) =>
                    handleQuickUpdate({ status: value as WorkTask["status"] })
                  }
                />
              </OverviewCard>
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                accentClassName="bg-violet-600"
                icon={Info}
                iconClassName="text-violet-600"
                title="Chi tiết công việc"
                subtitle="Mô tả công việc và thời hạn thực hiện chi tiết"
              >
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-sm leading-6 text-gray-700">
                  {task.description || "Chưa có mô tả cho công việc này."}
                </div>
                <div className="mt-16 grid grid-cols-1 gap-5 border-t border-gray-100 pt-4 sm:grid-cols-2">
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
                  disabled={quickUpdating}
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

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
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
                className="lg:col-span-2"
                accentClassName="bg-emerald-500"
                icon={RotateCcw}
                iconClassName="text-emerald-500"
                title="Timeline hoạt động công việc"
                subtitle="Nhật ký lịch trình xử lý & báo cáo"
              >
                <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 text-center">
                  <CalendarDays className="h-9 w-9 text-gray-300" />
                  <p className="mt-3 text-sm font-bold text-gray-800">
                    Chưa có lịch sử hoạt động
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Các cập nhật trạng thái, phân công và báo cáo
                  </p>
                </div>
              </Panel>
            </section>
          </div>
        ) : tab === "tasks" ? (
          <WorkTaskSubtasksPanel
            workTask={task}
            members={members}
            onSubtasksChanged={load}
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

      <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] gap-2">
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

      {editing && (
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
          }}
        />
      )}
    </div>
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
        "flex min-w-[190px] flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
