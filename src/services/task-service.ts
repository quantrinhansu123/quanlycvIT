import { apiClient } from "@/services/api-client";
import type {
  TaskPriority,
  ProgressReportSubmission,
  TaskReport,
  TaskStatus,
  WorkTask,
  WorkTaskInput,
} from "@/types/task";

export type TaskReportSubmission = ProgressReportSubmission;

export interface TaskFilters {
  search?: string;
  projectId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

function buildQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.status) params.set("status", filters.status);
  if (filters.overdueOnly) params.set("overdueOnly", "true");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const taskService = {
  async getTasks(filters: TaskFilters = {}): Promise<WorkTask[]> {
    return apiClient.get<WorkTask[]>(`/tasks${buildQuery(filters)}`);
  },

  async getTaskById(id: string): Promise<WorkTask | null> {
    return apiClient.get<WorkTask>(`/tasks/${id}`);
  },

  async createTask(input: WorkTaskInput): Promise<WorkTask> {
    return apiClient.post<WorkTask>("/tasks", input);
  },

  async updateTask(id: string, input: WorkTaskInput): Promise<WorkTask | null> {
    return apiClient.put<WorkTask>(`/tasks/${id}`, input);
  },

  async moveTask(
    id: string,
    status: TaskStatus,
    position: number
  ): Promise<WorkTask> {
    return apiClient.patch<WorkTask>(`/tasks/${id}/move`, { status, position });
  },

  async deleteTask(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/tasks/${id}`);
  },

  async getTaskReports(taskId: string): Promise<TaskReport[]> {
    return apiClient.get<TaskReport[]>(`/tasks/${taskId}/reports`);
  },

  async addTaskReport(
    taskId: string,
    input: TaskReportSubmission
  ): Promise<TaskReport> {
    const formData = new FormData();
    formData.set("content", input.content);
    formData.set("progress", String(input.progress));
    if (input.authorId) formData.set("authorId", input.authorId);
    if (input.links.length > 0) {
      formData.set("links", JSON.stringify(input.links));
    }
    for (const image of input.images) formData.append("images", image);
    for (const file of input.files) formData.append("files", file);

    return apiClient.postFormData<TaskReport>(
      `/tasks/${taskId}/reports`,
      formData
    );
  },

  async deleteTaskReport(reportId: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/reports/${reportId}`);
  },
};
