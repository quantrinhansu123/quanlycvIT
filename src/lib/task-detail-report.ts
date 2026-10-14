import type { AcceptanceStatus, Subtask } from "@/types/subtask";

export const DETAIL_REPORT_STATUSES: { value: AcceptanceStatus; label: string }[] = [
  { value: "acceptance", label: "Nghiệm thu" },
  { value: "testing", label: "Đang test" },
  { value: "tested", label: "Đã test" },
  { value: "rework", label: "Làm lại" },
  { value: "pending", label: "Chưa hoàn thành" },
  { value: "accepted", label: "Hoàn thành" },
  { value: "cancelled", label: "Hủy bỏ" },
];

export function groupTaskDetailsForReport(task: Subtask) {
  const entries = [
    ...(!task.handover?.initialDeleted ? [{ id: "initial", description: task.description, fallback: "Chi tiết ban đầu" }] : []),
    ...task.updates.map((entry, index) => ({ ...entry, fallback: `Chi tiết ${index + 2}` })),
  ];
  return DETAIL_REPORT_STATUSES.map((status) => ({
    ...status,
    entries: entries.filter((entry) => (task.handover?.rows[entry.id]?.status ?? "pending") === status.value)
      .map((entry) => {
        const row = task.handover?.rows[entry.id];
        return {
          id: entry.id,
          title: task.handover?.titles?.[entry.id] || entry.fallback,
          description: entry.description || "—",
          personnel: (row?.assigneeIds ?? []).map((id) => task.assignees.find((person) => person.id === id)?.name ?? id).join(", ") || "—",
          note: row?.note || "—",
          imageUrl: row?.imageUrl || "",
        };
      }),
  })).filter((group) => group.entries.length > 0);
}
