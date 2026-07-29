export type AccountRole = "admin" | "manager" | "member";
export type AccountStatus = "active" | "inactive";

export interface Department {
  id: string;
  code: string;
  name: string;
  positions: string[];
}

export interface EmployeeAccount {
  id: string;
  employeeCode: string;
  name: string;
  phone?: string;
  address?: string;
  avatarUrl?: string;
  birthDate?: string;
  startDate?: string;
  endDate?: string;
  bankAccount?: string;
  bankName?: string;
  note?: string;
  username?: string;
  email?: string;
  departmentId?: string;
  department?: Department;
  position?: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AccountInput {
  employeeCode: string;
  name: string;
  phone?: string;
  address?: string;
  avatarUrl?: string;
  birthDate?: string;
  startDate?: string;
  endDate?: string;
  bankAccount?: string;
  bankName?: string;
  note?: string;
  username?: string;
  email?: string;
  departmentId?: string;
  position?: string;
  role: AccountRole;
  status: AccountStatus;
}

export interface AccountDirectory {
  accounts: EmployeeAccount[];
  departments: Department[];
}
