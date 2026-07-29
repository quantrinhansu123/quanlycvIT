import { apiClient } from "@/services/api-client";
import type { AccountDirectory, AccountInput, EmployeeAccount } from "@/types/account";

export const accountService = {
  getAll: () => apiClient.get<AccountDirectory>("/accounts"),
  getById: (id: string) => apiClient.get<EmployeeAccount>(`/accounts/${id}`),
  create: (input: AccountInput) => apiClient.post<EmployeeAccount>("/accounts", input),
  update: (id: string, input: AccountInput) =>
    apiClient.put<EmployeeAccount>(`/accounts/${id}`, input),
  updatePassword: (id: string, newPassword: string) =>
    apiClient.post<boolean>(`/accounts/${id}/password`, { newPassword }),
  delete: (id: string) => apiClient.delete<boolean>(`/accounts/${id}`),
};
