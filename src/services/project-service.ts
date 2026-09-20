import { apiClient } from "@/services/api-client";
import type {
  Project,
  ProjectDirectoryItem,
  ProjectInput,
  ProjectMember,
  ProjectOption,
} from "@/types/project";
import type { ProjectTask } from "@/services/mock-data";

export interface ProjectPage {
  items: Project[];
  total: number;
}

export const projectService = {
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.set("file", file);
    const uploaded = await apiClient.postFormData<{
      url: string;
      publicId: string;
    }>("/media/task-image", formData);
    return uploaded.url;
  },

  /** Tải tệp lên Google Drive qua Apps Script proxy, trả về tên và link Drive. */
  async uploadFile(file: File): Promise<{ name: string; url: string }> {
    const formData = new FormData();
    formData.set("file", file);
    return apiClient.postFormData<{ name: string; url: string }>(
      "/media/task-file",
      formData
    );
  },

  async getProjects(search?: string, options?: { signal?: AbortSignal }): Promise<Project[]> {
    const query = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    return apiClient.get<Project[]>(`/projects${query}`, { signal: options?.signal });
  },

  async getProjectDirectory(options?: { signal?: AbortSignal }): Promise<ProjectDirectoryItem[]> {
    return apiClient.get<ProjectDirectoryItem[]>("/projects?directory=true", { signal: options?.signal });
  },

  /** Chỉ id/mã/tên — đủ cho bộ lọc danh sách, không kéo thành viên và thống kê công việc. */
  async getProjectOptions(search?: string): Promise<ProjectOption[]> {
    const params = new URLSearchParams({ fields: "options" });
    if (search?.trim()) params.set("q", search.trim());
    return apiClient.get<ProjectOption[]>(`/projects?${params.toString()}`);
  },

  /** Dự án kèm người tham gia và ngày, bỏ thống kê/đính kèm — dùng cho form công việc. */
  async getProjectsForForm(search?: string): Promise<Project[]> {
    const params = new URLSearchParams({ fields: "form" });
    if (search?.trim()) params.set("q", search.trim());
    return apiClient.get<Project[]>(`/projects?${params.toString()}`);
  },

  /** Tải một trang dự án từ server, có thể lọc theo nhiều người quản lý. */
  async getProjectsPage(
    search: string | undefined,
    page: number,
    pageSize: number,
    managerIds?: string[],
    options?: { signal?: AbortSignal; lite?: "dashboard" }
  ): Promise<ProjectPage> {
    const params = new URLSearchParams();
    if (search?.trim()) params.set("q", search.trim());
    if (managerIds && managerIds.length > 0) {
      params.set("managerIds", managerIds.join(","));
    }
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (options?.lite) params.set("lite", options.lite);
    return apiClient.get<ProjectPage>(`/projects?${params.toString()}`, {
      signal: options?.signal,
    });
  },

  async getProjectById(id: string): Promise<Project | null> {
    return apiClient.get<Project>(`/projects/${id}`);
  },

  async createProject(input: ProjectInput, options?: { idempotencyKey?: string }): Promise<Project> {
    return apiClient.post<Project>("/projects", input, {
      headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    });
  },

  async updateProject(id: string, input: ProjectInput): Promise<Project | null> {
    return apiClient.put<Project>(`/projects/${id}`, input);
  },

  async deleteProject(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/projects/${id}`);
  },

  async getDirectory(options?: { signal?: AbortSignal }): Promise<ProjectMember[]> {
    return apiClient.get<ProjectMember[]>("/users", { signal: options?.signal });
  },

  async getProjectTasks(projectId: string): Promise<ProjectTask[]> {
    return apiClient.get<ProjectTask[]>(`/projects/${projectId}/tasks`);
  },
};

export function generateProjectCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join("");
  return `DA-${base || "MOI"}`;
}
