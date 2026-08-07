import { ApiException } from "@/lib/api/response";
import type { ProjectColor, ProjectInput, ProjectStepConfig } from "@/types/project";
import type { SubtaskInput, TaskFileAttachment, TaskLinkAttachment } from "@/types/subtask";
import type { TaskPriority, TaskStatus, WorkTaskInput } from "@/types/task";

const PROJECT_COLORS = new Set<ProjectColor>(["purple", "green", "orange", "red", "blue"]);
const TASK_STATUSES = new Set<TaskStatus>(["todo", "inProgress", "review", "done"]);
const TASK_PRIORITIES = new Set<TaskPriority>(["low", "medium", "high", "urgent"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredString(body: Record<string, unknown>, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiException(`${label} là bắt buộc.`, 400);
  }
  return value.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiException(`${key} phải là chuỗi.`, 400);
  }
  return value.trim() || undefined;
}

function requiredDate(body: Record<string, unknown>, key: string, label: string): string {
  const value = requiredString(body, key, label);
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiException(`${label} phải có định dạng YYYY-MM-DD.`, 400);
  }
  return value;
}

function stringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiException(`${key} phải là một mảng chuỗi.`, 400);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function imageUrls(body: Record<string, unknown>): string[] {
  const images = stringArray(body, "images");
  if (images.length > 10) {
    throw new ApiException("Mỗi Task chỉ được lưu tối đa 10 ảnh.", 400);
  }
  if (images.some((url) => !isHttpUrl(url))) {
    throw new ApiException("Danh sách ảnh có URL không hợp lệ.", 400);
  }
  return images;
}

function fileAttachments(body: Record<string, unknown>): TaskFileAttachment[] {
  const value = body.files;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ApiException("Danh sách tệp đính kèm phải là một mảng.", 400);
  }
  if (value.length > 10) {
    throw new ApiException("Mỗi Task chỉ được đính kèm tối đa 10 tệp.", 400);
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiException("Tệp đính kèm không hợp lệ.", 400);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string" || !isHttpUrl(entry.url.trim())) {
      throw new ApiException("Tệp đính kèm phải có đường dẫn hợp lệ.", 400);
    }
    if (typeof entry.name !== "string" || !entry.name.trim()) {
      throw new ApiException("Tệp đính kèm phải có tên.", 400);
    }
    const description =
      typeof entry.description === "string" && entry.description.trim()
        ? entry.description.trim()
        : undefined;
    return { name: entry.name.trim(), url: entry.url.trim(), description };
  });
}

function linkAttachments(body: Record<string, unknown>): TaskLinkAttachment[] {
  const value = body.links;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ApiException("Danh sách liên kết phải là một mảng.", 400);
  }
  if (value.length > 10) {
    throw new ApiException("Mỗi Task chỉ được đính kèm tối đa 10 liên kết.", 400);
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiException("Liên kết đính kèm không hợp lệ.", 400);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string" || !isHttpUrl(entry.url.trim())) {
      throw new ApiException("Liên kết đính kèm phải có đường dẫn hợp lệ.", 400);
    }
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : undefined;
    const description =
      typeof entry.description === "string" && entry.description.trim()
        ? entry.description.trim()
        : undefined;
    return { label, url: entry.url.trim(), description };
  });
}

function progressValue(body: Record<string, unknown>): number {
  const value = body.progress;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiException("Tiến độ phải là số từ 0 đến 100.", 400);
  }
  return Math.round(value);
}

function taskStatus(body: Record<string, unknown>): TaskStatus {
  const value = requiredString(body, "status", "Trạng thái") as TaskStatus;
  if (!TASK_STATUSES.has(value)) {
    throw new ApiException("Trạng thái không hợp lệ.", 400);
  }
  return value;
}

function optionalTaskStatus(body: Record<string, unknown>): TaskStatus | undefined {
  if (body.status === undefined || body.status === null || body.status === "") return undefined;
  return taskStatus(body);
}

function taskPriority(body: Record<string, unknown>): TaskPriority {
  const value = requiredString(body, "priority", "Mức ưu tiên") as TaskPriority;
  if (!TASK_PRIORITIES.has(value)) {
    throw new ApiException("Mức ưu tiên không hợp lệ.", 400);
  }
  return value;
}

function validateDateRange(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new ApiException("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.", 400);
  }
}

function projectSteps(body: Record<string, unknown>): ProjectStepConfig[] {
  const value = body.steps;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiException("Dự án phải có cấu hình bước trạng thái.", 400);
  }

  const steps = value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof (item as Record<string, unknown>).key !== "string" ||
      typeof (item as Record<string, unknown>).label !== "string" ||
      typeof (item as Record<string, unknown>).enabled !== "boolean"
    ) {
      throw new ApiException("Cấu hình bước trạng thái không hợp lệ.", 400);
    }
    return item as ProjectStepConfig;
  });

  if (!steps.some((step) => step.enabled)) {
    throw new ApiException("Dự án phải bật ít nhất một bước trạng thái.", 400);
  }
  return steps;
}

export function parseProjectInput(body: Record<string, unknown>): ProjectInput {
  const startDate = requiredDate(body, "startDate", "Ngày bắt đầu");
  const endDate = requiredDate(body, "endDate", "Ngày kết thúc");
  validateDateRange(startDate, endDate);

  const color = requiredString(body, "color", "Màu dự án") as ProjectColor;
  if (!PROJECT_COLORS.has(color)) {
    throw new ApiException("Màu dự án không hợp lệ.", 400);
  }
  const managerIds = stringArray(body, "managerIds");
  if (managerIds.length === 0) {
    throw new ApiException("Dự án phải có ít nhất một người quản lý.", 400);
  }

  return {
    name: requiredString(body, "name", "Tên dự án"),
    code: requiredString(body, "code", "Mã dự án").toUpperCase(),
    color,
    steps: projectSteps(body),
    description: optionalString(body, "description"),
    startDate,
    endDate,
    managerIds,
    memberIds: stringArray(body, "memberIds"),
    files: fileAttachments(body),
    links: linkAttachments(body),
    images: imageUrls(body),
  };
}

/** Chấp nhận cả `assigneeIds` (mới) lẫn `assigneeId` (dữ liệu/API cũ). */
function assigneeIds(body: Record<string, unknown>): string[] {
  const ids = stringArray(body, "assigneeIds");
  if (ids.length > 0) return ids;

  const legacy = optionalString(body, "assigneeId");
  if (legacy) return [legacy];

  throw new ApiException("Vui lòng chọn ít nhất một người phụ trách.", 400);
}

export function parseWorkTaskInput(body: Record<string, unknown>): WorkTaskInput {
  const startDate = requiredDate(body, "startDate", "Ngày bắt đầu");
  const dueDate = requiredDate(body, "dueDate", "Ngày hoàn thành");
  validateDateRange(startDate, dueDate);

  return {
    title: requiredString(body, "title", "Tên công việc"),
    description: optionalString(body, "description"),
    projectId: requiredString(body, "projectId", "Dự án"),
    assigneeIds: assigneeIds(body),
    status: taskStatus(body),
    priority: taskPriority(body),
    startDate,
    dueDate,
    progress: progressValue(body),
    tags: stringArray(body, "tags"),
    dependsOnTaskId: optionalString(body, "dependsOnTaskId"),
    files: fileAttachments(body),
    links: linkAttachments(body),
    images: imageUrls(body),
  };
}

/** Chỉ chấp nhận link http/https để tránh javascript: và data: URL. */
function reportLinkUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiException(`Liên kết “${value}” không hợp lệ.`, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiException("Liên kết ngoài phải bắt đầu bằng http:// hoặc https://.", 400);
  }
  return parsed.toString();
}

function reportLinks(raw: FormDataEntryValue | null): TaskReportLinkInput[] {
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string") {
    throw new ApiException("Danh sách liên kết không hợp lệ.", 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiException("Danh sách liên kết phải là JSON hợp lệ.", 400);
  }
  if (!Array.isArray(parsed)) {
    throw new ApiException("Danh sách liên kết phải là một mảng.", 400);
  }

  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiException("Liên kết ngoài không hợp lệ.", 400);
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string" || !entry.url.trim()) {
      throw new ApiException("Liên kết ngoài phải có đường dẫn.", 400);
    }
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : undefined;
    return { label, url: reportLinkUrl(entry.url.trim()) };
  });
}

export interface TaskReportLinkInput {
  label?: string;
  url: string;
}

export interface TaskReportFields {
  authorId?: string;
  content: string;
  progress: number;
  links: TaskReportLinkInput[];
}

export function parseTaskReportFields(fields: {
  content: FormDataEntryValue | null;
  progress: FormDataEntryValue | null;
  authorId: FormDataEntryValue | null;
  links: FormDataEntryValue | null;
}): TaskReportFields {
  if (typeof fields.content !== "string" || !fields.content.trim()) {
    throw new ApiException("Nội dung báo cáo là bắt buộc.", 400);
  }

  const progress = Number(fields.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new ApiException("Tiến độ phải là số từ 0 đến 100.", 400);
  }

  const authorId =
    typeof fields.authorId === "string" && fields.authorId.trim()
      ? fields.authorId.trim()
      : undefined;

  return {
    authorId,
    content: fields.content.trim(),
    progress: Math.round(progress),
    links: reportLinks(fields.links),
  };
}

export function parseSubtaskInput(body: Record<string, unknown>): SubtaskInput {
  const startDate = requiredDate(body, "startDate", "Ngày bắt đầu");
  const dueDate = requiredDate(body, "dueDate", "Ngày kết thúc");
  validateDateRange(startDate, dueDate);

  return {
    title: requiredString(body, "title", "Tên task"),
    description: optionalString(body, "description"),
    workTaskId: requiredString(body, "workTaskId", "Công việc"),
    assigneeIds: assigneeIds(body),
    status: optionalTaskStatus(body),
    priority: taskPriority(body),
    startDate,
    dueDate,
    progress: progressValue(body),
    tags: stringArray(body, "tags"),
    files: fileAttachments(body),
    links: linkAttachments(body),
    images: imageUrls(body),
  };
}
