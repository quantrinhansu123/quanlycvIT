import { apiClient } from "@/services/api-client";
import type {
  DutyChecklistToggleResult,
  DutyChecklistTemplate,
  DutyChecklistTemplateInput,
  DutyRecurringRule,
  DutyRecurringRuleInput,
  DutyShift,
  DutyShiftInput,
} from "@/types/duty";

export const dutyService = {
  async getRoster(from: string, to: string, options?: { signal?: AbortSignal }): Promise<DutyShift[]> {
    return apiClient.get<DutyShift[]>(`/truc-nhat/ca?from=${from}&to=${to}`, { signal: options?.signal });
  },

  async getShiftByDate(date: string): Promise<DutyShift> {
    return apiClient.get<DutyShift>(`/truc-nhat/ca/${date}`);
  },

  async upsertShift(input: DutyShiftInput): Promise<DutyShift> {
    return apiClient.put<DutyShift>("/truc-nhat/ca", input);
  },

  async generateSchedule(to: string): Promise<boolean> {
    return apiClient.post<boolean>("/truc-nhat/ca/generate", { to });
  },

  async toggleChecklistItem(itemId: string, done: boolean): Promise<DutyChecklistToggleResult> {
    return apiClient.patch<DutyChecklistToggleResult>(`/truc-nhat/ca-dau-viec/${itemId}`, { done });
  },

  async getRecurringRules(options?: { signal?: AbortSignal }): Promise<DutyRecurringRule[]> {
    return apiClient.get<DutyRecurringRule[]>("/truc-nhat/lich-lap", { signal: options?.signal });
  },

  async createRecurringRule(input: DutyRecurringRuleInput): Promise<DutyRecurringRule> {
    return apiClient.post<DutyRecurringRule>("/truc-nhat/lich-lap", input);
  },

  async updateRecurringRule(id: string, input: DutyRecurringRuleInput): Promise<DutyRecurringRule | null> {
    return apiClient.put<DutyRecurringRule>(`/truc-nhat/lich-lap/${id}`, input);
  },

  async deleteRecurringRule(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/truc-nhat/lich-lap/${id}`);
  },

  async getChecklistTemplates(options?: { signal?: AbortSignal }): Promise<DutyChecklistTemplate[]> {
    return apiClient.get<DutyChecklistTemplate[]>("/truc-nhat/dau-viec-mau", { signal: options?.signal });
  },

  async createChecklistTemplate(input: DutyChecklistTemplateInput): Promise<DutyChecklistTemplate> {
    return apiClient.post<DutyChecklistTemplate>("/truc-nhat/dau-viec-mau", input);
  },

  async updateChecklistTemplate(id: string, input: DutyChecklistTemplateInput): Promise<DutyChecklistTemplate | null> {
    return apiClient.put<DutyChecklistTemplate>(`/truc-nhat/dau-viec-mau/${id}`, input);
  },

  async deleteChecklistTemplate(id: string): Promise<boolean> {
    return apiClient.delete<boolean>(`/truc-nhat/dau-viec-mau/${id}`);
  },
};
