import { apiClient } from "@/services/api-client";
import type { DepartmentInput, DepartmentRecord } from "@/types/department";

export const departmentService = {
  getAll: () => apiClient.get<DepartmentRecord[]>("/departments"),
  create: (input: DepartmentInput) =>
    apiClient.post<DepartmentRecord>("/departments", input),
  update: (id: string, input: DepartmentInput) =>
    apiClient.put<DepartmentRecord>(`/departments/${id}`, input),
  delete: (id: string) => apiClient.delete<boolean>(`/departments/${id}`),
};
