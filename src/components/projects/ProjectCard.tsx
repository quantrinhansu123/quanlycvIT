"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { PROJECT_STATUS_META, type Project } from "@/types/project";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ActionMenu } from "@/components/projects/ActionMenu";
import { formatDateVN } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const router = useRouter();
  const progress =
    project.stats.total > 0 ? Math.round((project.stats.done / project.stats.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={project.color}>{project.code}</Badge>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROJECT_STATUS_META[project.status].badge}`}
          >
            {PROJECT_STATUS_META[project.status].label}
          </span>
        </div>
        <ActionMenu
          onView={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
          onEdit={() => onEdit(project)}
          onDelete={() => onDelete(project)}
        />
      </div>

      <button
        type="button"
        onClick={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
        className="text-left"
      >
        <p className="line-clamp-1 text-sm font-semibold text-gray-800 hover:text-brand-600">
          {project.name}
        </p>
        {project.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-400">{project.description}</p>
        )}
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <AvatarStack people={project.managers} />
        <span className="truncate">
          {project.managers.length > 0
            ? project.managers.map((manager) => manager.name).join(", ")
            : "Chưa phân công quản lý"}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateVN(project.startDate)}
        </span>
        <span>&rarr;</span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDateVN(project.endDate)}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between pt-1">
        <AvatarStack people={project.members} />
        <span className="text-xs font-semibold text-gray-500">{progress}% hoàn thành</span>
      </div>
    </div>
  );
}
