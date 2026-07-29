export type DepartmentStatus = "active" | "inactive";

export interface DepartmentPosition {
  id: string;
  name: string;
  level: number;
  managerId?: string;
}

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  level: number;
  positions: string[];
  positionStructure: DepartmentPosition[];
  description?: string;
  status: DepartmentStatus;
  createdAt: string;
  updatedAt: string;
  employeeCount: number;
  positionCounts: Record<string, number>;
}

export interface DepartmentInput {
  code: string;
  name: string;
  parentId?: string;
  level: number;
  positions: string[];
  positionStructure: DepartmentPosition[];
  description?: string;
  status: DepartmentStatus;
}
