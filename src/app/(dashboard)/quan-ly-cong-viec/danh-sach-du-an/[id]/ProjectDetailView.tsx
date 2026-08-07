"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Clock3,
  FileClock,
  History,
  Info,
  ListTodo,
  Pencil,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import type { ProjectTask } from "@/services/mock-data";
import {
  PROJECT_STATUS_META,
  type Project,
  type ProjectMember,
} from "@/types/project";
import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressRing } from "@/components/projects/ProgressRing";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { ProjectTasksPanel } from "@/components/projects/ProjectTasksPanel";
import { ActivityTimeline } from "@/components/timeline/ActivityTimeline";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";

const ProjectFormModal = dynamic(
  () => import("@/components/projects/ProjectFormModal").then((mod) => mod.ProjectFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);
import { getErrorMessage } from "@/lib/errors";
import { DetailAttachments } from "@/components/tasks/DetailAttachments";
import { InlineTaskAttachmentEditor } from "@/components/tasks/InlineTaskAttachmentEditor";

type Tab = "info" | "tasks" | "history";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDayDistance(date: string): number {
  const target = new Date(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS);
}

interface ProjectDetailViewProps {
  projectId: string;
  initialProject: Project | null;
  initialTasks: ProjectTask[];
  initialMembers: ProjectMember[];
  readOnly: boolean;
}

export function ProjectDetailView({
  projectId,
  initialProject,
  initialTasks,
  initialMembers,
  readOnly,
}: ProjectDetailViewProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const cache = useSessionDataCache();
  const [project, setProject] = useState<Project | null>(initialProject);
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectData, taskData, memberData] = await Promise.all([
        projectService.getProjectById(projectId),
        projectService.getProjectTasks(projectId),
        readOnly ? Promise.resolve([]) : projectService.getDirectory(),
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
        description: getErrorMessage(
          loadError,
          "Vui lòng kiểm tra kết nối và thử lại."
        ),
      });
    }
  }, [projectId, notify, readOnly]);

  const handleAttachmentSave = useCallback(async (value: {
    files: TaskFileAttachment[];
    links: TaskLinkAttachment[];
    images: string[];
  }) => {
    if (!project || readOnly) return;
    try {
      const updated = await projectService.updateProject(project.id, {
        name: project.name,
        code: project.code,
        color: project.color,
        steps: project.steps,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        managerIds: project.managers.map((member) => member.id),
        memberIds: project.members.map((member) => member.id),
        files: value.files,
        links: value.links,
        images: value.images,
      });
      if (!updated) throw new Error("Dự án không tồn tại hoặc đã bị xóa.");
      setProject(updated);
      cache.invalidate(CACHE_RESOURCE.projectsList);
      cache.invalidate(CACHE_RESOURCE.directoryProjects);
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu dự án",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [cache, notify, project, readOnly]);

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6">
        <EmptyState
          icon={AlertCircle}
          title="Không tìm thấy dự án"
          description="Dự án có thể đã bị xóa."
        />
      </div>
    );
  }

  const progress =
    project.stats.total > 0
      ? Math.round((project.stats.done / project.stats.total) * 100)
      : 0;
  const notDone = project.stats.total - project.stats.done;
  const dueDistance = getDayDistance(project.endDate);
  const statusMeta = PROJECT_STATUS_META[project.status];

  return (
    <div
      className={cn(
        "bg-white",
        tab === "tasks"
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "min-h-full pb-2"
      )}
    >
      <div className="shrink-0 border-b border-gray-100 bg-white">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-4 px-3 py-3 sm:px-5">
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
                href="/quan-ly-cong-viec/danh-sach-du-an"
                className="shrink-0 font-semibold text-gray-600 hover:text-brand-600"
              >
                Danh sách dự án
              </Link>
              <span>&gt;</span>
              <span className="truncate font-semibold text-gray-500">
                Dự án {project.name}
              </span>
            </nav>
          </div>

          {!readOnly && <Button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full bg-brand-600 hover:bg-brand-700"
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">Chỉnh sửa dự án</span>
          </Button>}
        </div>
      </div>

      <div
        className={cn(
          "mx-auto",
          tab === "tasks"
            ? "flex min-h-0 w-full max-w-none flex-1 px-3 pb-3 pt-3 sm:px-5"
            : "w-full max-w-none px-3 pb-8 pt-4 sm:px-5"
        )}
      >
        {tab === "info" ? (
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewCard
                label="Tiến độ tổng thể"
                icon={CircleCheck}
                iconClassName="bg-violet-50 text-violet-600"
              >
                <strong className="text-2xl font-bold text-gray-950">{progress}%</strong>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${progress}%` }}
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
                    dueDistance < 0 && project.status !== "done"
                      ? "text-rose-500"
                      : "text-gray-900"
                  )}
                >
                  {project.status === "done"
                    ? "Đã hoàn thành"
                    : dueDistance < 0
                      ? `Trễ hạn ${Math.abs(dueDistance)} ngày`
                      : dueDistance === 0
                        ? "Hạn hôm nay"
                        : `Còn ${dueDistance} ngày`}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {formatDateVN(project.endDate)}
                </p>
              </OverviewCard>

              <OverviewCard
                label="Tổng công việc"
                icon={ClipboardList}
                iconClassName="bg-brand-50 text-brand-600"
              >
                <strong className="text-2xl font-bold text-gray-950">
                  {project.stats.total}
                </strong>
                <p className="mt-2 text-xs text-gray-400">
                  {project.stats.done} hoàn thành · {notDone} chưa xong
                </p>
              </OverviewCard>

              <OverviewCard
                label="Trạng thái"
                icon={Activity}
                iconClassName="bg-teal-50 text-teal-600"
              >
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1.5 text-xs font-bold",
                    statusMeta.badge
                  )}
                >
                  {statusMeta.label}
                </span>
                <p className="mt-2 text-xs text-gray-400">{project.code}</p>
              </OverviewCard>
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                accentClassName="bg-violet-600"
                icon={Info}
                iconClassName="text-violet-600"
                title="Chi tiết dự án"
                subtitle="Mục tiêu, mô tả và khung thời gian triển khai dự án"
              >
                <div className="mb-4">
                  <Badge color={project.color}>{project.code}</Badge>
                </div>
                <div className="min-h-24 max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-sm leading-6 text-gray-700">
                  <ProjectDescription description={project.description} />
                </div>
                {readOnly ? (
                  <DetailAttachments
                    entityLabel="dự án"
                    files={project.files}
                    links={project.links}
                    images={project.images}
                  />
                ) : (
                  <InlineTaskAttachmentEditor
                    key={`${project.id}:${JSON.stringify(project.files)}:${JSON.stringify(project.links)}`}
                    entityLabel="dự án"
                    files={project.files}
                    links={project.links}
                    images={project.images}
                    onUploadFile={projectService.uploadFile}
                    onUploadImage={projectService.uploadImage}
                    onSave={handleAttachmentSave}
                  />
                )}
                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-gray-100 pt-4 sm:grid-cols-2">
                  <DateInfo
                    label="Thời gian bắt đầu:"
                    value={formatDateVN(project.startDate)}
                    icon={CalendarDays}
                  />
                  <DateInfo
                    label="Hạn hoàn thành:"
                    value={formatDateVN(project.endDate)}
                    icon={Clock3}
                  />
                </div>
              </Panel>

              <Panel
                accentClassName="bg-violet-600"
                icon={UsersRound}
                iconClassName="text-violet-600"
                title="Ban điều hành & Nhân sự"
                subtitle="Quản lý chính và thành viên tham gia dự án"
              >
                <p className="mb-2 text-xs font-medium text-gray-400">
                  Quản lý dự án:
                </p>
                <div className="space-y-2">
                  {project.managers.map((manager, index) => (
                    <div
                      key={manager.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3"
                    >
                      <Avatar name={manager.name} color={manager.avatarColor} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">
                          {manager.name}
                          {index === 0 && (
                            <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
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
                    <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-400">
                      Chưa phân công người quản lý
                    </p>
                  )}
                </div>

                <p className="mb-2 mt-5 text-xs font-medium text-gray-400">
                  Thành viên tham gia ({project.members.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.members.map((member) => (
                    <span
                      key={member.id}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1 text-xs font-medium text-brand-600"
                    >
                      <Avatar name={member.name} color={member.avatarColor} size="sm" />
                      {member.name}
                    </span>
                  ))}
                  {project.members.length === 0 && (
                    <p className="text-sm italic text-gray-400">Chưa có thành viên</p>
                  )}
                </div>
              </Panel>
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Panel
                accentClassName="bg-brand-500"
                icon={ClipboardList}
                iconClassName="text-brand-500"
                title="Thống kê công việc"
                subtitle="Tỷ lệ hoàn thành theo dữ liệu công việc thực tế"
              >
                <div className="flex flex-col items-center text-center">
                  <ProgressRing percent={progress} />
                  <div className="mt-5 grid w-full grid-cols-2 border-t border-gray-100 pt-4">
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Hoàn thành</p>
                      <p className="text-lg font-bold text-emerald-500">
                        {project.stats.done}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-gray-400">Chưa xong</p>
                      <p className="text-lg font-bold text-gray-700">{notDone}</p>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel
                className="lg:col-span-2"
                accentClassName="bg-emerald-500"
                icon={History}
                iconClassName="text-emerald-500"
                title="Timeline hoạt động dự án"
                subtitle="Danh sách công việc của dự án theo thứ tự cập nhật"
              >
                <ActivityTimeline
                  itemLabel="Công việc"
                  items={tasks.map((item) => ({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    href: `/quan-ly-cong-viec/danh-sach-cong-viec/${item.id}`,
                    status: item.status,
                    priority: item.priority,
                    assignees:
                      item.assignees && item.assignees.length > 0
                        ? item.assignees
                        : item.assignee.id
                          ? [item.assignee]
                          : [],
                    startDate: item.startDate,
                    dueDate: item.dueDate,
                    progress: item.progress,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                  }))}
                  emptyTitle="Dự án chưa có công việc"
                  emptyDescription="Khi thêm công việc vào dự án, các công việc sẽ được liệt kê tại timeline này."
                />
              </Panel>
            </section>
          </div>
        ) : tab === "tasks" ? (
          <section className="min-h-0 w-full flex-1">
            <ProjectTasksPanel
              project={project}
              members={members}
              onTasksChanged={load}
              readOnly={readOnly}
            />
          </section>
        ) : (
          <section className="min-h-[520px] rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                <History className="h-4 w-4 text-violet-600" />
                Lịch sử báo cáo
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                Các báo cáo tiến độ đã gửi cho dự án
              </p>
            </div>
            <EmptyState
              icon={FileClock}
              title="Chưa có lịch sử báo cáo"
              description="Các báo cáo tiến độ của dự án sẽ được liệt kê tại đây."
            />
          </section>
        )}
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex w-full max-w-none gap-2 overflow-x-auto">
          <BottomTab
            active={tab === "info"}
            onClick={() => setTab("info")}
            icon={Info}
            label="Thông tin dự án"
          />
          <BottomTab
            active={tab === "tasks"}
            onClick={() => setTab("tasks")}
            icon={ListTodo}
            label="Công việc"
            count={tasks.length}
          />
          <BottomTab
            active={tab === "history"}
            onClick={() => setTab("history")}
            icon={History}
            label="Lịch sử báo cáo"
            count={0}
          />
        </div>
      </div>

      {editing && !readOnly && (
        <ProjectFormModal
          mode="edit"
          project={project}
          members={members}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
            // Trang chi tiết đã tự refetch (load()) — ở đây chỉ cần xóa cache của
            // danh sách dự án chính + directory dự án để không hiển thị dữ liệu cũ
            // khi người dùng quay lại 2 nơi đó (theo ma trận invalidation GĐ6).
            cache.invalidate(CACHE_RESOURCE.projectsList);
            cache.invalidate(CACHE_RESOURCE.directoryProjects);
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

function ProjectDescription({ description }: { description?: string }) {
  if (!description) {
    return <p>Chưa có mô tả cho dự án này.</p>;
  }

  return (
    <p className="min-w-full whitespace-pre-wrap break-words">
      {description.split(/(https?:\/\/\S+)/g).map((part, index) =>
        /^https?:\/\//.test(part) ? (
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
