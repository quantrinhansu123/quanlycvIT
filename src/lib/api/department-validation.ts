import { ApiException } from "@/lib/api/response";
import type {
  DepartmentInput,
  DepartmentPosition,
  DepartmentStatus,
} from "@/types/department";

const STATUSES = new Set<DepartmentStatus>(["active", "inactive"]);

function text(body: Record<string, unknown>, key: string, required = false) {
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

export function parseDepartmentInput(body: Record<string, unknown>): DepartmentInput {
  const level = Number(body.level);
  if (!Number.isInteger(level) || level < 1) {
    throw new ApiException("Cấp độ phải là số nguyên lớn hơn 0.", 400);
  }

  const rawStructure = body.positionStructure;
  if (!Array.isArray(rawStructure)) {
    throw new ApiException("Cấu trúc chức vụ không hợp lệ.", 400);
  }
  const positionStructure = rawStructure.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiException(`Chức vụ thứ ${index + 1} không hợp lệ.`, 400);
    }
    const position = item as Record<string, unknown>;
    const name = typeof position.name === "string" ? position.name.trim() : "";
    const id = typeof position.id === "string" && position.id.trim()
      ? position.id.trim()
      : crypto.randomUUID();
    const positionLevel = Number(position.level);
    const managerId =
      typeof position.managerId === "string" && position.managerId.trim()
        ? position.managerId.trim()
        : undefined;
    if (!name) throw new ApiException(`Tên chức vụ thứ ${index + 1} là bắt buộc.`, 400);
    if (!Number.isInteger(positionLevel) || positionLevel < 1) {
      throw new ApiException(`Cấp bậc chức vụ thứ ${index + 1} không hợp lệ.`, 400);
    }
    return { id, name, level: positionLevel, managerId } satisfies DepartmentPosition;
  });
  const ids = new Set(positionStructure.map((position) => position.id));
  if (ids.size !== positionStructure.length) {
    throw new ApiException("Mã chức vụ bị trùng.", 400);
  }
  for (const position of positionStructure) {
    if (position.managerId && (!ids.has(position.managerId) || position.managerId === position.id)) {
      throw new ApiException(`Quan hệ quản lý của chức vụ ${position.name} không hợp lệ.`, 400);
    }
  }
  const positions = positionStructure.map((position) => position.name);
  const status = text(body, "status", true) as DepartmentStatus;
  if (!STATUSES.has(status)) throw new ApiException("Trạng thái không hợp lệ.", 400);

  return {
    code: text(body, "code", true)!,
    name: text(body, "name", true)!,
    parentId: text(body, "parentId"),
    level,
    positions,
    positionStructure,
    description: text(body, "description"),
    status,
  };
}
