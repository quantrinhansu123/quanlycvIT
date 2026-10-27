import type { AcceptanceItem, AcceptanceRow, AcceptanceStatus, SubtaskHandover, SubtaskHandoverStatus } from "@/types/subtask";

const HANDOVER_VERSION = 2;
const MAX_ROWS = 50;
const MAX_ITEMS = 100;

export const INITIAL_HANDOVER_SOURCE_ID = "initial";

/** Tiến độ thực tế = tỷ lệ lần trong Chi tiết Task có trạng thái Hoàn thành. Lần khác tính 0%. */
export function detailTaskProgressPercent(
  updateIds: string[],
  rows: Record<string, { status?: string | null }> | undefined,
  includeInitial = true,
): number {
  const ids = [...(includeInitial ? [INITIAL_HANDOVER_SOURCE_ID] : []), ...updateIds.filter((id) => id.length > 0)];
  if (ids.length === 0) return 0;
  const score = ids.reduce((sum, id) => sum + (rows?.[id]?.status === "accepted" ? 100 : 0), 0);
  return Math.round(score / ids.length);
}

export function emptyAcceptanceRow(): AcceptanceRow {
  return { imageUrl: "", status: "pending", note: "" };
}

export function emptyHandover(imageUrl = ""): SubtaskHandover {
  return { text: "", imageUrl, statuses: {}, rows: {} };
}

function acceptanceStatus(value: unknown): AcceptanceStatus {
  if (value === "accepted" || value === "handedOver") return "accepted";
  if (value === "testing" || value === "tested" || value === "acceptance" || value === "rework" || value === "cancelled") return value;
  return "pending";
}

export function normalizeAcceptanceRows(value: unknown): Record<string, AcceptanceRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const rows: Record<string, AcceptanceRow> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(rows).length >= MAX_ROWS) break;
    if (key.length === 0 || key.length > 80 || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const imageUrl = typeof entry.imageUrl === "string" ? entry.imageUrl.trim() : "";
    const note = typeof entry.note === "string" ? entry.note.slice(0, 5_000) : "";
    const assigneeIds = Array.isArray(entry.assigneeIds)
      ? [...new Set(entry.assigneeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0 && id.length <= 100))].slice(0, 100)
      : undefined;
    const items = Array.isArray(entry.items)
      ? entry.items.slice(0, MAX_ITEMS).flatMap((item, index): AcceptanceItem[] => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const value = item as Record<string, unknown>;
          const id = typeof value.id === "string" && value.id.trim() && value.id.length <= 80 ? value.id.trim() : `item-${index}`;
          return [{
            id,
            name: typeof value.name === "string" ? value.name.slice(0, 500) : "",
            note: typeof value.note === "string" ? value.note.slice(0, 2_000) : "",
          }];
        })
      : undefined;
    rows[key] = { imageUrl, status: acceptanceStatus(entry.status), note,
      ...(assigneeIds !== undefined ? { assigneeIds } : {}),
      ...(items !== undefined ? { items } : {}),
    };
  }
  return rows;
}

export function normalizeHandoverStatuses(value: unknown): Record<string, SubtaskHandoverStatus> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const statuses: Record<string, SubtaskHandoverStatus> = {};
  for (const [key, status] of Object.entries(value)) {
    if (Object.keys(statuses).length >= MAX_ROWS) break;
    if (key.length === 0 || key.length > 80) continue;
    if (status === "pending" || status === "handedOver") statuses[key] = status;
  }
  return statuses;
}

function rowsFromLegacy(
  statuses: Record<string, SubtaskHandoverStatus>,
  text: string,
  imageUrl: string,
): Record<string, AcceptanceRow> {
  const rows: Record<string, AcceptanceRow> = {};
  for (const [key, status] of Object.entries(statuses)) {
    rows[key] = {
      imageUrl: key === INITIAL_HANDOVER_SOURCE_ID ? imageUrl : "",
      status: status === "handedOver" ? "accepted" : "pending",
      note: key === INITIAL_HANDOVER_SOURCE_ID ? text : "",
    };
  }
  if (!rows[INITIAL_HANDOVER_SOURCE_ID] && (text || imageUrl)) {
    rows[INITIAL_HANDOVER_SOURCE_ID] = { imageUrl, status: "pending", note: text };
  }
  return rows;
}

export function normalizeDetailTitles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, title]) =>
    id.length > 0 && id.length <= 80 && typeof title === "string"
  ).slice(0, MAX_ROWS).map(([id, title]) => [id, (title as string).trim().slice(0, 500)]));
}

export function encodeHandoverContent(handover: Pick<SubtaskHandover, "text" | "statuses" | "rows" | "titles" | "initialDeleted">): string {
  return JSON.stringify({
    v: HANDOVER_VERSION,
    text: handover.text,
    statuses: normalizeHandoverStatuses(handover.statuses),
    rows: normalizeAcceptanceRows(handover.rows),
    titles: normalizeDetailTitles(handover.titles),
    initialDeleted: handover.initialDeleted === true,
  });
}

export function decodeHandoverContent(raw: string | null | undefined): Pick<SubtaskHandover, "text" | "statuses" | "rows" | "titles" | "initialDeleted"> {
  const value = raw ?? "";
  if (!value.startsWith("{")) return { text: value, statuses: {}, rows: rowsFromLegacy({}, value, "") };
  try {
    const parsed = JSON.parse(value) as { v?: unknown; text?: unknown; statuses?: unknown; rows?: unknown; titles?: unknown; initialDeleted?: unknown };
    const text = typeof parsed.text === "string" ? parsed.text : "";
    const statuses = normalizeHandoverStatuses(parsed.statuses);
    if (parsed.v === HANDOVER_VERSION) {
      return { text, statuses, rows: normalizeAcceptanceRows(parsed.rows), titles: normalizeDetailTitles(parsed.titles), initialDeleted: parsed.initialDeleted === true };
    }
    if (parsed.v === 1) {
      return { text, statuses, rows: rowsFromLegacy(statuses, text, "") };
    }
    return { text: value, statuses: {}, rows: {} };
  } catch {
    return { text: value, statuses: {}, rows: {} };
  }
}

export function decodeHandover(content: string | null | undefined, imageUrl: string | null | undefined): SubtaskHandover {
  const decoded = decodeHandoverContent(content);
  const legacyImage = imageUrl ?? "";
  const rows = { ...decoded.rows };
  if (legacyImage && rows[INITIAL_HANDOVER_SOURCE_ID] && !rows[INITIAL_HANDOVER_SOURCE_ID].imageUrl) {
    rows[INITIAL_HANDOVER_SOURCE_ID] = { ...rows[INITIAL_HANDOVER_SOURCE_ID], imageUrl: legacyImage };
  } else if (legacyImage && !rows[INITIAL_HANDOVER_SOURCE_ID]) {
    rows[INITIAL_HANDOVER_SOURCE_ID] = { imageUrl: legacyImage, status: "pending", note: decoded.text };
  }
  return { ...decoded, rows, imageUrl: legacyImage };
}
