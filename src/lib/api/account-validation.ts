import { ApiException } from "@/lib/api/response";
import type { AccountInput, AccountRole, AccountStatus } from "@/types/account";

const ROLES = new Set<AccountRole>(["admin", "manager", "member"]);
const STATUSES = new Set<AccountStatus>(["active", "inactive"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(body: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiException(`${key} là bắt buộc.`, 400);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiException(`${key} không hợp lệ.`, 400);
  const normalized = value.trim();
  if (required && !normalized) throw new ApiException(`${key} là bắt buộc.`, 400);
  return normalized || undefined;
}

function date(body: Record<string, unknown>, key: string): string | undefined {
  const value = text(body, key);
  if (value && (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
    throw new ApiException(`${key} phải có định dạng YYYY-MM-DD.`, 400);
  }
  return value;
}

export function parseAccountInput(body: Record<string, unknown>): AccountInput {
  const email = text(body, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiException("Email không hợp lệ.", 400);
  }
  const role = text(body, "role", true) as AccountRole;
  const status = text(body, "status", true) as AccountStatus;
  if (!ROLES.has(role)) throw new ApiException("Vai trò không hợp lệ.", 400);
  if (!STATUSES.has(status)) throw new ApiException("Trạng thái không hợp lệ.", 400);
  const startDate = date(body, "startDate");
  const endDate = date(body, "endDate");
  if (startDate && endDate && endDate < startDate) {
    throw new ApiException("Ngày nghỉ việc phải sau ngày vào làm.", 400);
  }
  return {
    employeeCode: text(body, "employeeCode", true)!,
    name: text(body, "name", true)!,
    phone: text(body, "phone"),
    address: text(body, "address"),
    avatarUrl: text(body, "avatarUrl"),
    birthDate: date(body, "birthDate"),
    startDate,
    endDate,
    bankAccount: text(body, "bankAccount"),
    bankName: text(body, "bankName"),
    note: text(body, "note"),
    username: text(body, "username"),
    email,
    departmentId: text(body, "departmentId"),
    position: text(body, "position"),
    role,
    status,
  };
}
