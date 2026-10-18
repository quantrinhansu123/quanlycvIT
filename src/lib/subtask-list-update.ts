import type { Subtask } from "@/types/subtask";

/** Editing detail personnel must not remove its Task from the visible list. */
export function updateVisibleSubtaskPage(
  page: { items: Subtask[]; total: number },
  updated: Subtask,
  statuses: string[],
  statusChanged: boolean,
) {
  if (!page.items.some((item) => item.id === updated.id)) return page;
  if (statusChanged && statuses.length > 0 && !statuses.includes(updated.status)) {
    return { items: page.items.filter((item) => item.id !== updated.id), total: Math.max(0, page.total - 1) };
  }
  return { items: page.items.map((item) => item.id === updated.id ? updated : item), total: page.total };
}
