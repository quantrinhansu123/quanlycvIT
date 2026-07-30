import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";

export type ProjectStepKey = "todo" | "inProgress" | "review" | "done";

export interface ProjectStepConfig {
  key: ProjectStepKey;
  label: string;
  enabled: boolean;
}

export const DEFAULT_PROJECT_STEPS: ProjectStepConfig[] = [
  { key: "todo", label: "Cần làm", enabled: true },
  { key: "inProgress", label: "Đang làm", enabled: true },
  { key: "review", label: "Chờ đánh giá", enabled: true },
  { key: "done", label: "Hoàn thành", enabled: true },
];

export type ProjectColor = "purple" | "green" | "orange" | "red" | "blue";
export type ProjectStatus = "notStarted" | "inProgress" | "overdue" | "done";

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; badge: string }
> = {
  notStarted: { label: "Chưa bắt đầu", badge: "bg-gray-100 text-gray-600" },
  inProgress: { label: "Đang thực hiện", badge: "bg-sky-100 text-sky-700" },
  overdue: { label: "Trễ hạn", badge: "bg-rose-100 text-rose-600" },
  done: { label: "Hoàn thành", badge: "bg-emerald-100 text-emerald-700" },
};

export const PROJECT_COLORS: { value: ProjectColor; hex: string }[] = [
  { value: "purple", hex: "#7C5CFC" },
  { value: "green", hex: "#22C55E" },
  { value: "orange", hex: "#F59E0B" },
  { value: "red", hex: "#EF4444" },
  { value: "blue", hex: "#3B82F6" },
];

export interface ProjectMember {
  id: string;
  name: string;
  role?: string;
  email?: string;
  avatarColor: string;
}

export interface ProjectStats {
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  color: ProjectColor;
  steps: ProjectStepConfig[];
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  managers: ProjectMember[];
  /** Người quản lý chính, giữ lại để tương thích với dữ liệu/API cũ. */
  manager: ProjectMember;
  members: ProjectMember[];
  stats: ProjectStats;
  /** Tệp đính kèm, đã tải lên Google Drive. */
  files: TaskFileAttachment[];
  /** Liên kết ngoài đính kèm. */
  links: TaskLinkAttachment[];
  /** Danh sách URL ảnh minh họa của dự án. */
  images: string[];
}

export interface ProjectInput {
  name: string;
  code: string;
  color: ProjectColor;
  steps: ProjectStepConfig[];
  description?: string;
  startDate: string;
  endDate: string;
  managerIds: string[];
  memberIds: string[];
  /** Tối đa 10 tệp, mỗi tệp là link Google Drive. */
  files: TaskFileAttachment[];
  /** Tối đa 10 liên kết ngoài. */
  links: TaskLinkAttachment[];
  /** Tối đa 10 URL ảnh đã tải lên Cloudinary. */
  images: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}
