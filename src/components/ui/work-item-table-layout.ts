/** Mẫu layout dùng chung cho bảng Công việc và Task. */
export const WORK_ITEM_TABLE_CLASS =
  "w-full table-fixed border-collapse text-xs @[1000px]:min-w-0";

export const WORK_ITEM_TITLE_CLASS =
  "work-item-title text-left text-xs font-semibold text-gray-800 hover:text-brand-600";

export const WORK_ITEM_PROGRESS_CLASS = "w-full max-w-24";

export function taskColumnWidths(hideProjectColumn: boolean, readOnly = false): string[] {
  if (readOnly) {
    return hideProjectColumn
      ? ["w-[24%]", "w-[20%]", "w-[16%]", "w-[16%]", "w-[11%]", "w-[13%]"]
      : ["w-[18%]", "w-[14%]", "w-[17%]", "w-[14%]", "w-[14%]", "w-[10%]", "w-[13%]"];
  }
  return hideProjectColumn
    ? ["w-[4%]", "w-[20%]", "w-[18%]", "w-[14%]", "w-[15%]", "w-[10%]", "w-[12%]", "w-[7%]"]
    : ["w-[4%]", "w-[15%]", "w-[12%]", "w-[16%]", "w-[13%]", "w-[13%]", "w-[9%]", "w-[11%]", "w-[7%]"];
}

export function subtaskColumnWidths(
  hideWorkTaskColumn: boolean,
  showProjectColumn: boolean
): string[] {
  if (hideWorkTaskColumn) {
    return ["w-[4%]", "w-[14%]", "w-[19%]", "w-[15%]", "w-[13%]", "w-[9%]", "w-[11%]", "w-[15%]"];
  }
  if (showProjectColumn) {
    return ["w-[4%]", "w-[12%]", "w-[10%]", "w-[9%]", "w-[14%]", "w-[11%]", "w-[9%]", "w-[8%]", "w-[9%]", "w-[14%]"];
  }
  return ["w-[4%]", "w-[14%]", "w-[13%]", "w-[16%]", "w-[13%]", "w-[12%]", "w-[8%]", "w-[10%]", "w-[10%]"];
}
