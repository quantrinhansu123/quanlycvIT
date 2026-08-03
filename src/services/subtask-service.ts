import { apiClient } from "@/services/api-client";
import type { Subtask, SubtaskInput, SubtaskReport } from "@/types/subtask";
import type {
  ProgressReportSubmission,
  TaskPriority,
  TaskStatus,
} from "@/types/task";
import type { TaskActivityEvent } from "@/types/activity";

export interface SubtaskFilters {
  search?: string;
  workTaskId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

function buildQuery(filters: SubtaskFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.workTaskId) params.set("workTaskId", filters.workTaskId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.status) params.set("status", filters.status);
  if (filters.overdueOnly) params.set("overdueOnly", "true");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export interface SubtaskListFilters extends SubtaskFilters {
  projectId?: string;
  workTaskIds?: string[];
  assigneeIds?: string[];
  page: number;
  pageSize: number;
}

export interface SubtaskPage {
  items: Subtask[];
  total: number;
}

export interface TaskActivityPage {
  items: TaskActivityEvent[];
  total: number;
}

export const subtaskService = {
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

  async getSubtasks(filters: SubtaskFilters = {}): Promise<Subtask[]> {
    return apiClient.get<Subtask[]>(`/subtasks${buildQuery(filters)}`);
  },

  /** Tải một trang task từ server, có thể lọc theo dự án và nhiều người thực hiện. */
  async getSubtasksPage(
    filters: SubtaskListFilters,
    options?: { signal?: AbortSignal }
  ): Promise<SubtaskPage> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.workTaskId) params.set("workTaskId", filters.workTaskId);
    if (filters.workTaskIds && filters.workTaskIds.length > 0) {
      params.set("workTaskIds", filters.workTaskIds.join(","));
    }
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
    return apiClient.get<SubtaskPage>(`/subtasks?${params.toString()}`, {
      signal: options?.signal,
    });
  },

  async getSubtaskById(id: string): Promise<Subtask | null> {
    return apiClient.get<Subtask>(`/subtasks/${id}`);
  },

  async getSubtasksByWorkTask(workTaskId: string): Promise<Subtask[]> {
    return apiClient.get<Subtask[]>(`/tasks/${workTaskId}/subtasks`);
  },

  async createSubtask(input: SubtaskInput, options?: { idempotencyKey?: string }): Promise<Subtask> {
    return apiClient.post<Subtask>("/subtasks", input, {
      headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    });
  },

  async updateSubtask(
    id: string,
    input: SubtaskInput
  ): Promise<Subtask | null> {
    return apiClient.put<Subtask>(`/subtasks/${id}`, input);
  },

  async deleteSubtask(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/subtasks/${id}`);
  },

  /** Duyệt task đã báo cáo tiến độ 100% ("Chờ duyệt") sang "Hoàn thành". Chỉ admin được gọi. */
  async approveSubtask(id: string): Promise<Subtask | null> {
    return apiClient.post<Subtask>(`/subtasks/${id}/approve`);
  },

  async acceptSubtask(id: string): Promise<Subtask> {
    return apiClient.post<Subtask>(`/subtasks/${id}/accept`);
  },

  async getSubtaskReports(subtaskId: string): Promise<SubtaskReport[]> {
    return apiClient.get<SubtaskReport[]>(`/subtasks/${subtaskId}/reports`);
  },

  async getSubtaskActivity(
    subtaskId: string,
    page = 1,
    pageSize = 20
  ): Promise<TaskActivityPage> {
    return apiClient.get<TaskActivityPage>(
      `/subtasks/${subtaskId}/activity?page=${page}&pageSize=${pageSize}`
    );
  },

  async addSubtaskReport(
    subtaskId: string,
    input: ProgressReportSubmission
  ): Promise<SubtaskReport> {
    const formData = new FormData();
    formData.set("content", input.content);
    formData.set("progress", String(input.progress));
    if (input.authorId) formData.set("authorId", input.authorId);
    if (input.links.length > 0) {
      formData.set("links", JSON.stringify(input.links));
    }
    for (const image of input.images) formData.append("images", image);
    for (const file of input.files) formData.append("files", file);

    return apiClient.postFormData<SubtaskReport>(
      `/subtasks/${subtaskId}/reports`,
      formData
    );
  },
};
