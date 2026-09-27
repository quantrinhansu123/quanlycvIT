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
  authUserId?: string;
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

export interface EmployeeWorkSchedule {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
  createdAt: string;
}

export interface EmployeeWorkScheduleInput {
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
}

export interface EmployeeAttendance {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
}

export interface EmployeeAttendanceInput {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
}

export interface AccountDirectory {
  accounts: EmployeeAccount[];
  departments: Department[];
}

export interface AccountListFilters {
  search?: string;
  departmentId?: string;
  position?: string;
  role?: AccountRole;
  status?: AccountStatus;
  sort?: "employeeCode" | "name" | "username" | "startDate" | "createdAt";
  direction?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface AccountListSummary {
  total: number;
  active: number;
  admins: number;
  positions: string[];
  departments: Array<{ id: string; count: number }>;
}

export interface AccountPage {
  items: EmployeeAccount[];
  total: number;
  departments: Department[];
  summary: AccountListSummary;
}
