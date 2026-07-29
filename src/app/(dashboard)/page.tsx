"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FolderKanban, Users2 } from "lucide-react";
import { projectService } from "@/services/project-service";
import { DIRECTORY } from "@/services/mock-data";
import type { Project } from "@/types/project";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { formatDateVN } from "@/lib/utils";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    projectService.getProjects().then(setProjects);
  }, []);

  const totalTasks = projects?.reduce((sum, p) => sum + p.stats.total, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-lg font-bold text-gray-900">Xin chào, UP Edu Admin</h1>
      <p className="mb-6 text-sm text-gray-400">Tổng quan nhanh về hoạt động dự án trong hệ thống.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
            <FolderKanban className="h-5 w-5" />
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">{projects ? projects.length : "--"}</p>
          <p className="text-xs text-gray-400">Dự án đang quản lý</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">{projects ? totalTasks : "--"}</p>
          <p className="text-xs text-gray-400">Tổng đầu việc</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <Users2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">{DIRECTORY.length}</p>
          <p className="text-xs text-gray-400">Nhân sự trong hệ thống</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-bold text-gray-900">Dự án gần đây</h2>
          <Link href="/quan-ly-cong-viec/danh-sach-du-an" className="text-xs font-semibold text-blue-600 hover:underline">
            Xem tất cả
          </Link>
        </div>
        {projects === null ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <Badge color={project.color}>{project.code}</Badge>
                <Link
                  href={`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`}
                  className="flex-1 text-sm font-semibold text-gray-800 hover:text-blue-600"
                >
                  {project.name}
                </Link>
                <span className="text-xs text-gray-400">
                  {formatDateVN(project.startDate)} - {formatDateVN(project.endDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
