import { apiClient } from "@/services/api-client";
import type {
  AccountDirectory,
  AccountInput,
  AccountListFilters,
  AccountPage,
  Department,
  EmployeeAccount,
  EmployeeWorkSchedule,
  EmployeeWorkScheduleInput,
} from "@/types/account";

function pageQuery(filters: AccountListFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.position) params.set("position", filters.position);
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.direction) params.set("direction", filters.direction);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  return params.toString();
}

export const accountService = {
  getPage: (filters: AccountListFilters, options?: { signal?: AbortSignal }) =>
    apiClient.get<AccountPage>(`/accounts?${pageQuery(filters)}`, { signal: options?.signal }),
  getAnalytics: () => apiClient.get<AccountDirectory>("/accounts/analytics"),
  getDepartments: () => apiClient.get<Department[]>("/accounts/directory"),
  getById: (id: string) => apiClient.get<EmployeeAccount>(`/accounts/${id}`),
  create: (input: AccountInput) => apiClient.post<EmployeeAccount>("/accounts", input),
  createBatch: (items: AccountInput[]) =>
    apiClient.post<EmployeeAccount[]>("/accounts/batch", { items }),
  update: (id: string, input: AccountInput) =>
    apiClient.put<EmployeeAccount>(`/accounts/${id}`, input),
  updateStatus: (id: string, status: EmployeeAccount["status"]) =>
    apiClient.patch<EmployeeAccount>(`/accounts/${id}`, { status }),
  updateStatusBatch: (ids: string[], status: EmployeeAccount["status"]) =>
    apiClient.patch<EmployeeAccount[]>("/accounts/batch", { ids, status }),
  updatePassword: (id: string, newPassword: string) =>
    apiClient.post<boolean>(`/accounts/${id}/password`, { newPassword }),
  getWorkSchedule: (id: string) =>
    apiClient.get<EmployeeWorkSchedule[]>(`/accounts/${id}/work-schedule`),
  createWorkSchedule: (id: string, input: EmployeeWorkScheduleInput) =>
    apiClient.post<EmployeeWorkSchedule>(`/accounts/${id}/work-schedule`, input),
  delete: (id: string) => apiClient.delete<boolean>(`/accounts/${id}`),
};
