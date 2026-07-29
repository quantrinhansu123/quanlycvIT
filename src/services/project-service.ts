import { apiClient } from "@/services/api-client";
import type {
  Project,
  ProjectInput,
  ProjectMember,
} from "@/types/project";
import type { ProjectTask } from "@/services/mock-data";

export const projectService = {
  async getProjects(search?: string): Promise<Project[]> {
    const query = search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    return apiClient.get<Project[]>(`/projects${query}`);
  },

  async getProjectById(id: string): Promise<Project | null> {
    return apiClient.get<Project>(`/projects/${id}`);
  },

  async createProject(input: ProjectInput): Promise<Project> {
    return apiClient.post<Project>("/projects", input);
  },

  async updateProject(id: string, input: ProjectInput): Promise<Project | null> {
    return apiClient.put<Project>(`/projects/${id}`, input);
  },

  async deleteProject(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/projects/${id}`);
  },

  async getDirectory(): Promise<ProjectMember[]> {
    return apiClient.get<ProjectMember[]>("/users");
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
