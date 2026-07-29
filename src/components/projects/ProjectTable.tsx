"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { Project } from "@/types/project";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ActionMenu } from "@/components/projects/ActionMenu";
import { formatDateVN } from "@/lib/utils";

interface ProjectTableProps {
  projects: Project[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectTable({
  projects,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDelete,
}: ProjectTableProps) {
  const router = useRouter();
  const allSelected = projects.length > 0 && selectedIds.length === projects.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="w-12 px-6 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="Chọn tất cả"
              />
            </th>
            <th className="px-3 py-3">Mã dự án</th>
            <th className="px-3 py-3">Tên dự án</th>
            <th className="px-3 py-3">Quản lý (PM)</th>
            <th className="px-3 py-3">Ngày bắt đầu</th>
            <th className="px-3 py-3">Ngày kết thúc</th>
            <th className="px-3 py-3">Thành viên</th>
            <th className="w-16 px-3 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {projects.map((project) => (
            <tr key={project.id} className="group transition-colors hover:bg-gray-50/60">
              <td className="px-6 py-4 align-top">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(project.id)}
                  onChange={() => onToggleSelect(project.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label={`Chọn dự án ${project.name}`}
                />
              </td>
              <td className="px-3 py-4 align-top">
                <Badge color={project.color}>{project.code}</Badge>
              </td>
              <td className="max-w-xs px-3 py-4 align-top">
                <button
                  type="button"
                  onClick={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
                  className="block truncate text-left text-sm font-semibold text-gray-800 hover:text-blue-600"
                >
                  {project.name}
                </button>
                {project.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{project.description}</p>
                )}
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex items-center gap-2">
                  <AvatarStack people={project.managers} />
                  <span className="max-w-44 truncate text-sm text-gray-600">
                    {project.managers.length > 0
                      ? project.managers.map((manager) => manager.name).join(", ")
                      : "Chưa phân công"}
                  </span>
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <CalendarDays className="h-4 w-4 text-gray-300" />
                  {formatDateVN(project.startDate)}
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <CalendarDays className="h-4 w-4 text-gray-300" />
                  {formatDateVN(project.endDate)}
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <AvatarStack people={project.members} />
              </td>
              <td className="px-3 py-4 text-right align-top">
                <ActionMenu
                  onView={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
                  onEdit={() => onEdit(project)}
                  onDelete={() => onDelete(project)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
