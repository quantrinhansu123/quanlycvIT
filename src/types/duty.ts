import type { ProjectMember } from "@/types/project";

export type DutyShiftStatus = "chua_thuc_hien" | "dang_thuc_hien" | "hoan_thanh";
export type DutySource = "lap_lich" | "thu_cong";

export const DUTY_STATUS_OPTIONS: { value: DutyShiftStatus; label: string }[] = [
  { value: "chua_thuc_hien", label: "Chưa thực hiện" },
  { value: "dang_thuc_hien", label: "Đang thực hiện" },
  { value: "hoan_thanh", label: "Hoàn thành" },
];

export const DUTY_STATUS_META: Record<
  DutyShiftStatus,
  { label: string; badge: string; dot: string }
> = {
  chua_thuc_hien: { label: "Chưa thực hiện", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  dang_thuc_hien: { label: "Đang thực hiện", badge: "bg-sky-100 text-sky-600", dot: "bg-sky-500" },
  hoan_thanh: { label: "Hoàn thành", badge: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
};

/** 1 = Thứ 2 ... 7 = Chủ nhật. */
export const DUTY_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Thứ 2" },
  { value: 2, label: "Thứ 3" },
  { value: 3, label: "Thứ 4" },
  { value: 4, label: "Thứ 5" },
  { value: 5, label: "Thứ 6" },
  { value: 6, label: "Thứ 7" },
  { value: 7, label: "Chủ nhật" },
];

export interface DutyChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DutyChecklistTemplateInput {
  name: string;
  description?: string;
  order: number;
  active: boolean;
}

export interface DutyRecurringRule {
  id: string;
  weekday: number;
  assignees: ProjectMember[];
  startDate: string;
  endDate?: string;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DutyRecurringRuleInput {
  weekday: number;
  /** Danh sách người trực; phần tử đầu tiên là người trực chính. */
  assigneeIds: string[];
  startDate: string;
  endDate?: string;
  note?: string;
  active: boolean;
}

export interface DutyChecklistItem {
  id: string;
  templateId?: string;
  name: string;
  order: number;
  done: boolean;
  doneAt?: string;
  doneBy?: ProjectMember;
}

export interface DutyShift {
  /** null nghĩa là ca "ảo" — tính từ lịch lặp, chưa được chốt lưu trong DB. */
  id: string | null;
  date: string;
  status: DutyShiftStatus;
  source: DutySource;
  ruleId?: string;
  assignees: ProjectMember[];
  note?: string;
  checklist: DutyChecklistItem[];
}

export interface DutyShiftInput {
  date: string;
  assigneeIds: string[];
  note?: string;
  status?: DutyShiftStatus;
}
