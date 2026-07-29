import { apiClient } from "@/services/api-client";
import type { Subtask, SubtaskInput, SubtaskReport } from "@/types/subtask";
import type {
  ProgressReportSubmission,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

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

export const subtaskService = {
  async getSubtasks(filters: SubtaskFilters = {}): Promise<Subtask[]> {
    return apiClient.get<Subtask[]>(`/subtasks${buildQuery(filters)}`);
  },

  async getSubtaskById(id: string): Promise<Subtask | null> {
    return apiClient.get<Subtask>(`/subtasks/${id}`);
  },

  async getSubtasksByWorkTask(workTaskId: string): Promise<Subtask[]> {
    return apiClient.get<Subtask[]>(`/tasks/${workTaskId}/subtasks`);
  },

  async createSubtask(input: SubtaskInput): Promise<Subtask> {
    return apiClient.post<Subtask>("/subtasks", input);
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

  async getSubtaskReports(subtaskId: string): Promise<SubtaskReport[]> {
    return apiClient.get<SubtaskReport[]>(`/subtasks/${subtaskId}/reports`);
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
