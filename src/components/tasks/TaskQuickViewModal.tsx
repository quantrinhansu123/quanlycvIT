"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  ListChecks,
  MessageSquare,
  Plus,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { TaskReport, WorkTask } from "@/types/task";
import { TASK_STATUS_META } from "@/types/task";
import type { Subtask } from "@/types/subtask";
import type { Project, ProjectMember } from "@/types/project";
import { taskService } from "@/services/task-service";
import { subtaskService } from "@/services/subtask-service";
import { Button } from "@/components/ui/Button";
import { TaskStatusBadge, TaskPriorityBadge } from "@/components/tasks/TaskBadges";
import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer";
import { ProgressReportItem } from "@/components/tasks/ProgressReportItem";
import { formatDateVN, cn } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type QuickViewTab = "info" | "reports" | "timeline";

interface TaskQuickViewModalProps {
  task: WorkTask;
  project?: Project;
  assignee?: ProjectMember;
  initialTab?: QuickViewTab;
  onClose: () => void;
  onReportAdded?: () => void;
}

export function TaskQuickViewModal({
  task,
  project,
  assignee,
  initialTab = "info",
  onClose,
  onReportAdded,
}: TaskQuickViewModalProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [tab, setTab] = useState<QuickViewTab>(initialTab);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtasksLoaded, setSubtasksLoaded] = useState(false);
  // Tiến độ đổi ngay sau khi gửi báo cáo nên giữ bản sao cục bộ.
  const [progress, setProgress] = useState(task.progress);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const notifyLoadError = useCallback(
    (reportError: unknown) => {
      notify({
        type: "error",
        title: "Không thể tải lịch sử báo cáo",
        description: getErrorMessage(reportError, "Vui lòng thử lại."),
      });
    },
    [notify]
  );

  useEffect(() => {
    let active = true;
    taskService
      .getTaskReports(task.id)
      .then((data) => {
        if (!active) return;
        setReports(data);
        setReportsLoaded(true);
      })
      .catch((reportError) => {
        if (!active) return;
        notifyLoadError(reportError);
      });
    return () => {
      active = false;
    };
  }, [notifyLoadError, task.id]);

  // Tải danh sách task con
  useEffect(() => {
    let active = true;
    subtaskService
      .getSubtasksByWorkTask(task.id)
      .then((data) => {
        if (!active) return;
        setSubtasks(data);
        setSubtasksLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setSubtasksLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [task.id]);

  const reloadReports = useCallback(() => {
    taskService
      .getTaskReports(task.id)
      .then((data) => {
        setReports(data);
        setReportsLoaded(true);
      })
      .catch(notifyLoadError);
  }, [notifyLoadError, task.id]);

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden="true" />

        <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 px-7 pt-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} />
                <TaskPriorityBadge priority={task.priority} />
                {project && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
                    <Building2 className="h-3.5 w-3.5" />
                    {project.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(`/quan-ly-cong-viec/danh-sach-cong-viec/${task.id}`)
                }
                title="Mở trang đầy đủ"
                className="mt-3 block max-w-full truncate text-left text-2xl font-bold text-gray-900 hover:text-blue-600"
              >
                {task.title}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-7 pt-5">
            <div className="h-px bg-gray-100" />
            <div className="mt-4 inline-flex gap-1 rounded-xl bg-gray-50 p-1">
              <TabButton
                active={tab === "info"}
                onClick={() => setTab("info")}
                icon={User}
                label="Thông tin"
              />
              <TabButton
                active={tab === "reports"}
                onClick={() => setTab("reports")}
                icon={MessageSquare}
                label={`Báo cáo (${reportsLoaded ? reports.length : 0})`}
              />
              <TabButton
                active={tab === "timeline"}
                onClick={() => setTab("timeline")}
                icon={History}
                label="Timeline"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-7 py-6">
            {tab === "info" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Mô tả chi tiết
                  </p>
                  <div className="rounded-xl border border-gray-200 px-4 py-3.5 text-sm text-gray-600">
                    {task.description || "Chưa có mô tả cho công việc này."}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 px-4 py-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Tiến độ thực tế</p>
                    <span className="text-sm font-bold text-blue-600">{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoCard
                    icon={CalendarDays}
                    iconClassName="bg-blue-50 text-blue-500"
                    label="Ngày bắt đầu"
                    value={formatDateVN(task.startDate)}
                  />
                  <InfoCard
                    icon={Clock}
                    iconClassName="bg-amber-50 text-amber-500"
                    label="Ngày hoàn thành"
                    value={formatDateVN(task.dueDate)}
                  />
                </div>

                {assignee && (
                  <div className="rounded-xl border border-gray-200 px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          Người phụ trách
                        </p>
                        <p className="truncate text-sm font-bold text-gray-900">
                          {assignee.name}
                        </p>
                        {assignee.role && (
                          <p className="truncate text-xs text-gray-400">{assignee.role}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Danh sách Task con */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-gray-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Task ({subtasksLoaded ? subtasks.length : "..."})
                    </p>
                  </div>
                  {!subtasksLoaded ? (
                    <div className="rounded-xl border border-gray-200 px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">Đang tải task...</p>
                    </div>
                  ) : subtasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">Chưa có task nào trong công việc này.</p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {subtasks.map((st) => {
                        const statusMeta = TASK_STATUS_META[st.status];
                        const isDone = st.status === "done";
                        return (
                          <li
                            key={st.id}
                            className="group flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 hover:bg-gray-50"
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                isDone ? "bg-emerald-500 text-white" : "border-2 border-gray-300"
                              )}
                            >
                              {isDone && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "truncate text-sm font-medium",
                                isDone ? "text-gray-400 line-through" : "text-gray-800"
                              )}>
                                {st.title}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                                <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium", statusMeta.badge)}>
                                  <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                                  {statusMeta.label}
                                </span>
                                <span className="text-gray-400">
                                  {formatDateVN(st.startDate)} → {formatDateVN(st.dueDate)}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-xs font-semibold text-gray-500">{st.progress}%</span>
                              <div className="mt-0.5 h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    isDone ? "bg-emerald-500" : "bg-blue-500"
                                  )}
                                  style={{ width: `${st.progress}%` }}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === "reports" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-bold text-gray-900">Báo cáo từ nhân sự</p>
                  <Button onClick={() => setReportDrawerOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Báo cáo tiến độ
                  </Button>
                </div>

                {!reportsLoaded ? (
                  <DashedPanel>
                    <p className="text-sm text-gray-400">Đang tải lịch sử báo cáo...</p>
                  </DashedPanel>
                ) : reports.length === 0 ? (
                  <DashedPanel>
                    <MessageSquare className="h-9 w-9 text-gray-300" />
                    <p className="mt-3 text-sm font-semibold text-gray-700">
                      Chưa có báo cáo tiến độ
                    </p>
                    <p className="mt-1 max-w-sm text-sm text-gray-400">
                      Báo cáo tiến trình làm việc hàng ngày của bạn và thành viên sẽ được
                      tổng hợp ở đây.
                    </p>
                  </DashedPanel>
                ) : (
                  <ul className="space-y-3">
                    {reports.map((report) => (
                      <ProgressReportItem key={report.id} report={report} />
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "timeline" && (
              <DashedPanel>
                <CalendarDays className="h-9 w-9 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-700">
                  Chưa có lịch sử hoạt động
                </p>
                <p className="mt-1 max-w-sm text-sm text-gray-400">
                  Các cập nhật trạng thái, phân công và báo cáo tiến độ sẽ hiển thị tại đây.
                </p>
              </DashedPanel>
            )}
          </div>
        </div>
      </div>

      {reportDrawerOpen && (
        <TaskReportDrawer
          task={{ ...task, progress }}
          assignee={assignee}
          onClose={() => setReportDrawerOpen(false)}
          onSubmitted={(report) => {
            setProgress(report.progress);
            setTab("reports");
            reloadReports();
            onReportAdded?.();
          }}
        />
      )}
    </>
  );
}

function DashedPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-6 py-14 text-center">
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function InfoCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            iconClassName
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {label}
          </p>
          <p className="truncate text-sm font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
