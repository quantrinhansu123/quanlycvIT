"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Clock,
  History,
  MessageSquare,
  Plus,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Subtask, SubtaskReport } from "@/types/subtask";
import type { WorkTaskDirectoryItem } from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { subtaskService } from "@/services/subtask-service";
import { Button } from "@/components/ui/Button";
import { TaskStatusBadge, TaskPriorityBadge } from "@/components/tasks/TaskBadges";
import { TaskReportDrawer } from "@/components/tasks/TaskReportDrawer";
import { ProgressReportItem } from "@/components/tasks/ProgressReportItem";
import { formatDateVN, cn } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";

type QuickViewTab = "info" | "reports" | "timeline";

interface SubtaskQuickViewModalProps {
  subtask: Subtask;
  workTask?: WorkTaskDirectoryItem;
  assignee?: ProjectMember;
  initialTab?: QuickViewTab;
  onClose: () => void;
  onReportAdded?: () => void;
}

export function SubtaskQuickViewModal({
  subtask,
  workTask,
  assignee,
  initialTab = "info",
  onClose,
  onReportAdded,
}: SubtaskQuickViewModalProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const { account } = useCurrentAccount();
  const canReport = account?.role !== "admin";
  const [tab, setTab] = useState<QuickViewTab>(initialTab);
  const [reports, setReports] = useState<SubtaskReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [progress, setProgress] = useState(subtask.progress);

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

  const reloadReports = useCallback(() => {
    subtaskService
      .getSubtaskReports(subtask.id)
      .then((data) => {
        setReports(data);
        setReportsLoaded(true);
      })
      .catch(notifyLoadError);
  }, [notifyLoadError, subtask.id]);

  useEffect(() => {
    let active = true;
    subtaskService
      .getSubtaskReports(subtask.id)
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
  }, [notifyLoadError, subtask.id]);

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-gray-900/40"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 px-7 pt-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={subtask.status} />
                <TaskPriorityBadge priority={subtask.priority} />
                {workTask && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
                    <Building2 className="h-3.5 w-3.5" />
                    {workTask.title}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(`/quan-ly-cong-viec/danh-sach-task/${subtask.id}`)
                }
                title="Mở trang đầy đủ"
                className="mt-3 block max-w-full truncate text-left text-2xl font-bold text-gray-900 hover:text-brand-600"
              >
                {subtask.title}
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
                    {subtask.description || "Chưa có mô tả cho task này."}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 px-4 py-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Tiến độ thực tế</p>
                    <span className="text-sm font-bold text-brand-600">{progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoCard
                    icon={CalendarDays}
                    iconClassName="bg-brand-50 text-brand-500"
                    label="Ngày bắt đầu"
                    value={formatDateVN(subtask.startDate)}
                  />
                  <InfoCard
                    icon={Clock}
                    iconClassName="bg-amber-50 text-amber-500"
                    label="Ngày hoàn thành"
                    value={formatDateVN(subtask.dueDate)}
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
              </div>
            )}

            {tab === "reports" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-bold text-gray-900">Báo cáo từ nhân sự</p>
                  {canReport && <Button onClick={() => setReportDrawerOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Báo cáo tiến độ
                  </Button>}
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
                      Báo cáo tiến trình làm việc hằng ngày của bạn và thành viên sẽ
                      được tổng hợp ở đây.
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

      {reportDrawerOpen && canReport && (
        <TaskReportDrawer
          task={{
            id: subtask.id,
            title: subtask.title,
            progress,
            assigneeId: subtask.assigneeId,
          }}
          assignee={assignee}
          entityLabel="task"
          submitReport={(input) => subtaskService.addSubtaskReport(subtask.id, input)}
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
