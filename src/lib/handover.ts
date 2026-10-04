import type { SubtaskHandover, SubtaskHandoverStatus } from "@/types/subtask";

const HANDOVER_VERSION = 1;
const MAX_STATUS_ENTRIES = 50;

export const INITIAL_HANDOVER_SOURCE_ID = "initial";

export function emptyHandover(imageUrl = ""): SubtaskHandover {
  return { text: "", imageUrl, statuses: {} };
}

export function normalizeHandoverStatuses(value: unknown): Record<string, SubtaskHandoverStatus> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const statuses: Record<string, SubtaskHandoverStatus> = {};
  for (const [key, status] of Object.entries(value)) {
    if (Object.keys(statuses).length >= MAX_STATUS_ENTRIES) break;
    if (key.length === 0 || key.length > 80) continue;
    if (status === "pending" || status === "handedOver") statuses[key] = status;
  }
  return statuses;
}

export function encodeHandoverContent(handover: Pick<SubtaskHandover, "text" | "statuses">): string {
  return JSON.stringify({
    v: HANDOVER_VERSION,
    text: handover.text,
    statuses: normalizeHandoverStatuses(handover.statuses),
  });
}

export function decodeHandoverContent(raw: string | null | undefined): Pick<SubtaskHandover, "text" | "statuses"> {
  const value = raw ?? "";
  if (!value.startsWith("{")) return { text: value, statuses: {} };
  try {
    const parsed = JSON.parse(value) as { v?: unknown; text?: unknown; statuses?: unknown };
    if (parsed.v !== HANDOVER_VERSION) return { text: value, statuses: {} };
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      statuses: normalizeHandoverStatuses(parsed.statuses),
    };
  } catch {
    return { text: value, statuses: {} };
  }
}

export function decodeHandover(content: string | null | undefined, imageUrl: string | null | undefined): SubtaskHandover {
  const decoded = decodeHandoverContent(content);
  return { ...decoded, imageUrl: imageUrl ?? "" };
}
