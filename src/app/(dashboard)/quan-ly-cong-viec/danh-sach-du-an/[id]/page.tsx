"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileClock,
  Pencil,
  Users,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import type { ProjectTask } from "@/services/mock-data";
import type { Project, ProjectMember } from "@/types/project";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/projects/StatCard";
import { ProgressRing } from "@/components/projects/ProgressRing";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { ProjectTasksPanel } from "@/components/projects/ProjectTasksPanel";
import { formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type Tab = "info" | "tasks" | "history";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useFeedback();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectData, taskData, memberData] = await Promise.all([
        projectService.getProjectById(id),
        projectService.getProjectTasks(id),
        projectService.getDirectory(),
      ]);
      setProject(projectData);
      setTasks(taskData);
      setMembers(memberData);
      setError(false);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải chi tiết dự án",
        description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    }
  }, [id, notify]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState icon={AlertCircle} title="Không tìm thấy dự án" description="Dự án có thể đã bị xóa." />
      </div>
    );
  }

  const progress = project.stats.total > 0 ? Math.round((project.stats.done / project.stats.total) * 100) : 0;
  const notDone = project.stats.total - project.stats.done;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Quay lại"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Dự án: {project.name}</h1>
        </div>
        <Button onClick={() => setEditing(true)} className="bg-blue-600 hover:bg-blue-700">
          <Pencil className="h-4 w-4" />
          Chỉnh sửa dự án
        </Button>
      </div>

      {tab === "info" && (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Tổng việc" value={project.stats.total} icon={ClipboardList} iconClassName="bg-gray-100 text-gray-500" />
          <StatCard label="Hoàn thành" value={project.stats.done} icon={CheckCircle2} iconClassName="bg-emerald-50 text-emerald-500" />
          <StatCard label="Đang làm" value={project.stats.inProgress} icon={Clock} iconClassName="bg-sky-50 text-sky-500" />
          <StatCard label="Trễ hạn" value={project.stats.overdue} icon={AlertCircle} iconClassName="bg-rose-50 text-rose-500" />
        </div>
      )}

      {tab === "info" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="h-1 bg-violet-500" />
              <div className="p-6">
                <div className="mb-1">
                  <Badge color={project.color}>{project.code}</Badge>
                </div>
                <h2 className="mt-2 text-base font-bold text-gray-900">Thông tin dự án</h2>
                <p className="mb-4 text-xs text-gray-400">Chi tiết mục tiêu, mô tả và khung thời gian thực hiện</p>
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  {project.description || "Chưa có mô tả cho dự án này."}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Thời gian bắt đầu:</p>
                    <p className="mt-1 flex items-center gap-1.5 font-semibold text-gray-800">
                      <CalendarClock className="h-4 w-4 text-violet-400" />
                      {formatDateVN(project.startDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Thời gian kết thúc:</p>
                    <p className="mt-1 flex items-center gap-1.5 font-semibold text-gray-800">
                      <CalendarClock className="h-4 w-4 text-violet-400" />
                      {formatDateVN(project.endDate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="h-1 bg-violet-500" />
              <div className="flex flex-col items-center p-6 text-center">
                <h2 className="text-base font-bold text-gray-900">Tiến độ tổng thể</h2>
                <p className="mb-4 text-xs text-gray-400">Tỷ lệ hoàn thành công việc</p>
                <ProgressRing percent={progress} />
                <div className="mt-5 flex w-full items-center justify-around border-t border-gray-100 pt-4">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Hoàn thành</p>
                    <p className="text-lg font-bold text-emerald-500">{project.stats.done}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Chưa xong</p>
                    <p className="text-lg font-bold text-gray-700">{notDone}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="h-1 bg-sky-500" />
              <div className="p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Users className="h-4 w-4 text-sky-500" />
                  Ban điều hành &amp; Nhân sự
                </h2>
                <p className="mb-4 text-xs text-gray-400">Người phụ trách chính và các thành viên tham gia</p>

                <p className="text-xs font-medium text-gray-400">Quản lý dự án (PM):</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {project.managers.map((manager, index) => (
                    <div key={manager.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-gray-50 p-3">
                      <Avatar name={manager.name} color={manager.avatarColor} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {manager.name}
                          {index === 0 && (
                            <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                              Chính
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {manager.email || manager.role || "Chưa có thông tin liên hệ"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {project.managers.length === 0 && (
                    <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-400">
                      Chưa phân công người quản lý
                    </p>
                  )}
                </div>

                <p className="mt-4 text-xs font-medium text-gray-400">
                  Thành viên tham gia ({project.members.length}):
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {project.members.map((member) => (
                    <span
                      key={member.id}
                      className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-blue-600"
                    >
                      <Avatar name={member.name} color={member.avatarColor} size="sm" />
                      {member.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <div className="h-1 bg-emerald-500" />
              <div className="p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <FileClock className="h-4 w-4 text-emerald-500" />
                  Timeline hoạt động dự án
                </h2>
                <p className="mb-4 text-xs text-gray-400">Nhật ký hệ thống &amp; Báo cáo tiến trình</p>
                <EmptyState
                  icon={CalendarClock}
                  title="Chưa có lịch sử hoạt động"
                  description="Các cập nhật trạng thái, phân công và báo cáo tiến độ sẽ hiển thị tại đây."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <ProjectTasksPanel project={project} members={members} onTasksChanged={load} />
      )}

      {tab === "history" && (
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <EmptyState
            icon={FileClock}
            title="Chưa có lịch sử báo cáo"
            description="Các báo cáo tiến độ của dự án sẽ được liệt kê tại đây."
          />
        </div>
      )}

      <div className="sticky bottom-0 mt-5 flex gap-1 rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm">
        <TabButton active={tab === "info"} onClick={() => setTab("info")} label="Thông tin dự án" />
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} label="Công việc" count={tasks.length} />
        <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Lịch sử báo cáo" count={0} />
      </div>

      {editing && (
        <ProjectFormModal
          mode="edit"
          project={project}
          members={members}
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

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
            active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
