"use client";

import { useEffect, useMemo, useState } from "react";
import { projectService } from "@/services/project-service";
import type { ProjectDirectoryItem } from "@/types/project";

/**
 * Danh mục dự án dùng cho form sửa.
 *
 * Một số màn hình (chi tiết dự án, chi tiết công việc) chỉ truyền dự án hiện tại
 * hoặc có thể đang giữ cache danh mục rỗng, khiến dropdown "Dự án" không chọn
 * được. Hook này tải thêm danh mục đầy đủ và gộp với dữ liệu được truyền vào để
 * form luôn có đủ lựa chọn.
 */
export function useProjectDirectoryOptions(
  seed: ProjectDirectoryItem[]
): ProjectDirectoryItem[] {
  const [loaded, setLoaded] = useState<ProjectDirectoryItem[] | null>(null);

  useEffect(() => {
    let active = true;
    projectService
      .getProjectDirectory()
      .then((items) => {
        if (active && items.length > 0) setLoaded(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    if (!loaded) return seed;
    const byId = new Map(seed.map((project) => [project.id, project]));
    for (const project of loaded) byId.set(project.id, project);
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [seed, loaded]);
}
