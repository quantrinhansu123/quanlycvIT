"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, Eye, Pencil, Trash2 } from "lucide-react";
import { PROJECT_STATUS_META, type Project } from "@/types/project";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
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
    <div className="min-w-0">
      <table className="w-full min-w-[1080px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
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
            <th className="w-32 whitespace-nowrap px-3 py-3">Quản lý (PM)</th>
            <th className="px-3 py-3">Ngày bắt đầu</th>
            <th className="px-3 py-3">Ngày kết thúc</th>
            <th className="px-3 py-3">Thành viên</th>
            <th className="w-28 whitespace-nowrap px-2 py-3">Trạng thái</th>
            <th className="w-32 px-3 py-3 text-left">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {projects.map((project) => (
            <tr key={project.id} className="data-table-row group">
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
                  className="block truncate text-left text-xs font-semibold text-gray-800 hover:text-blue-600"
                >
                  {project.name}
                </button>
                {project.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{project.description}</p>
                )}
              </td>
              <td className="w-32 px-3 py-4 align-top">
                <AvatarStack people={project.managers} />
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CalendarDays className="h-4 w-4 text-gray-300" />
                  {formatDateVN(project.startDate)}
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CalendarDays className="h-4 w-4 text-gray-300" />
                  {formatDateVN(project.endDate)}
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <AvatarStack people={project.members} />
              </td>
              <td className="w-28 px-2 py-4 align-top">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROJECT_STATUS_META[project.status].badge}`}
                >
                  {PROJECT_STATUS_META[project.status].label}
                </span>
              </td>
              <td className="px-3 py-4 text-left align-top">
                <div className="flex items-center justify-start gap-1.5">
                  <ActionIconButton
                    icon={Eye}
                    label="Xem chi tiết"
                    onClick={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
                  />
                  <ActionIconButton
                    icon={Pencil}
                    label="Chỉnh sửa"
                    tone="warning"
                    onClick={() => onEdit(project)}
                  />
                  <ActionIconButton
                    icon={Trash2}
                    label="Xóa dự án"
                    tone="danger"
                    onClick={() => onDelete(project)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
