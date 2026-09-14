import { apiClient } from "@/services/api-client";
import type {
  TaskPriority,
  ProgressReportSubmission,
  TaskReport,
  TaskStatus,
  WorkTask,
  WorkTaskDirectoryItem,
  WorkTaskInput,
  WorkTaskOption,
} from "@/types/task";

export type TaskReportSubmission = ProgressReportSubmission;

export interface TaskFilters {
  search?: string;
  projectId?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  priority?: TaskPriority;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

function buildQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    params.set("assigneeIds", filters.assigneeIds.join(","));
  }
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.status) params.set("status", filters.status);
  if (filters.overdueOnly) params.set("overdueOnly", "true");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface TaskPage {
  items: WorkTask[];
  total: number;
}

export const taskService = {
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

  async getTasks(filters: TaskFilters = {}, options?: { signal?: AbortSignal }): Promise<WorkTask[]> {
    return apiClient.get<WorkTask[]>(`/tasks${buildQuery(filters)}`, { signal: options?.signal });
  },

  async getTaskDirectory(options?: { signal?: AbortSignal }): Promise<WorkTaskDirectoryItem[]> {
    return apiClient.get<WorkTaskDirectoryItem[]>("/tasks?directory=true", { signal: options?.signal });
  },

  /** Chỉ id + tên, dùng cho dropdown công việc tiền đề. */
  async getTaskOptions(filters: TaskFilters = {}): Promise<WorkTaskOption[]> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.assigneeIds && filters.assigneeIds.length > 0) {
      params.set("assigneeIds", filters.assigneeIds.join(","));
    }
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.status) params.set("status", filters.status);
    if (filters.overdueOnly) params.set("overdueOnly", "true");
    params.set("fields", "options");
    return apiClient.get<WorkTaskOption[]>(`/tasks?${params.toString()}`);
  },

  /** Tải một trang công việc từ server thay vì toàn bộ tập kết quả khớp bộ lọc. */
  async getTasksPage(
    filters: TaskFilters & { page: number; pageSize: number },
    options?: { signal?: AbortSignal }
  ): Promise<TaskPage> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.assigneeIds && filters.assigneeIds.length > 0) {
      params.set("assigneeIds", filters.assigneeIds.join(","));
    }
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.status) params.set("status", filters.status);
    if (filters.overdueOnly) params.set("overdueOnly", "true");
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    return apiClient.get<TaskPage>(`/tasks?${params.toString()}`, {
      signal: options?.signal,
    });
  },

  async getTaskById(id: string): Promise<WorkTask | null> {
    return apiClient.get<WorkTask>(`/tasks/${id}`);
  },

  async createTask(input: WorkTaskInput, options?: { idempotencyKey?: string }): Promise<WorkTask> {
    return apiClient.post<WorkTask>("/tasks", input, {
      headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    });
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
