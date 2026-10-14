import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Subtask } from "@/types/subtask";
import { loadPdfMake } from "@/lib/pdf-export";
import { groupTaskDetailsForReport } from "@/lib/task-detail-report";

export async function exportTaskDetailPdf(task: Subtask, workTaskTitle?: string, printWindow?: Window): Promise<void> {
  const groups = groupTaskDetailsForReport(task);
  const content: Content[] = [
    { text: "BÁO CÁO CHI TIẾT TASK", bold: true, fontSize: 18, margin: [0, 0, 0, 10] },
    { text: task.title, bold: true, fontSize: 13, margin: [0, 0, 0, 5] },
    ...(workTaskTitle ? [{ text: `Công việc: ${workTaskTitle}`, margin: [0, 0, 0, 4] } as Content] : []),
    { text: `Người phụ trách: ${task.assignees.map((person) => person.name).join(", ") || "—"}`, margin: [0, 0, 0, 4] },
    { text: `Xuất lúc: ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}`, color: "#64748b", fontSize: 9 },
  ];
  for (const group of groups) {
    content.push({ text: `${group.label} (${group.entries.length})`, bold: true, fontSize: 13, color: "#6d28d9", margin: [0, 16, 0, 7] });
    content.push({
      table: {
        headerRows: 1,
        widths: ["*", 100, 105],
        body: [
          ["Chi tiết / Nội dung", "Nhân sự", "Ghi chú / Ảnh nghiệm thu"].map((text) => ({ text, bold: true, fillColor: "#ede9fe" })),
          ...group.entries.map((entry): TableCell[] => [
            { stack: [{ text: entry.title, bold: true }, { text: entry.description, margin: [0, 4, 0, 0] }] },
            { text: entry.personnel },
            { stack: [
              { text: entry.note },
              ...( /^https?:\/\//i.test(entry.imageUrl) ? [{ text: "Xem ảnh nghiệm thu", link: entry.imageUrl, color: "#6d28d9", decoration: "underline" as const, margin: [0, 5, 0, 0] as [number, number, number, number] }] : []),
            ] },
          ]),
        ],
      },
      layout: "lightHorizontalLines",
    });
  }
  if (!groups.length) content.push({ text: "Chưa có chi tiết Task.", margin: [0, 16, 0, 0] });
  const definition: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [35, 35, 35, 40],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
    info: { title: `Báo cáo chi tiết Task - ${task.title}` },
    content,
    footer: (page, total) => ({ text: `Trang ${page}/${total}`, alignment: "right", fontSize: 9, margin: [35, 10, 35, 0] }),
  };
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(definition).print({}, printWindow);
}
