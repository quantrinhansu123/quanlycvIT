import type { SubtaskPromptItem } from "@/types/subtask";

/** Điểm của một Prompt. Không có trạng thái hoặc chưa xử lý tính 0%. */
export function promptStatusScore(status: string | null | undefined): number {
  if (status === "completed") return 100;
  if (status === "processed") return 50;
  return 0;
}

function countsTowardProgress(item: Pick<SubtaskPromptItem, "content" | "imageUrls">): boolean {
  return Boolean(item.content?.trim() || (item.imageUrls?.length ?? 0) > 0);
}

/** Phần trăm tiến độ thực tế = trung bình điểm trạng thái các Prompt. Không có Prompt thì 0%. */
export function promptProgressPercent(
  items: Array<Pick<SubtaskPromptItem, "content" | "imageUrls" | "status">>
): number {
  const counted = items.filter(countsTowardProgress);
  if (counted.length === 0) return 0;
  const total = counted.reduce((sum, item) => sum + promptStatusScore(item.status), 0);
  return Math.round(total / counted.length);
}
