import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Subtask } from "@/types/subtask";
import { loadPdfMake } from "@/lib/pdf-export";
import { groupTaskDetailsForReport, selectedAcceptanceDetails } from "@/lib/task-detail-report";

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

export async function printAcceptanceMinutes(task: Subtask, selectedIds: string[], printWindow: Window, workTaskTitle?: string): Promise<void> {
  const entries = selectedAcceptanceDetails(task, selectedIds);
  if (!entries.length) throw new Error("Vui lòng chọn chi tiết Task để lập biên bản.");
  const logoResponse = await fetch("/logo-viet-nhat-ipt.png");
  if (!logoResponse.ok) throw new Error("Không tải được logo cho biên bản.");
  const logo = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được logo."));
    void logoResponse.blob().then((blob) => reader.readAsDataURL(blob), reject);
  });
  const date = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const reference = `NT-${task.id.slice(0, 8).toUpperCase()}`;
  const completed = entries.filter((entry) => entry.status === "Hoàn thành").length;
  const definition: TDocumentDefinitions = {
    pageSize: "A4", pageMargins: [40, 36, 40, 50],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.3, color: "#334155" },
    info: { title: `Biên bản nghiệm thu - ${task.title}` },
    content: [
      { columns: [
        { image: logo, width: 112 },
        { stack: [{ text: "VIỆT NHẬT IPT", bold: true, fontSize: 12, color: "#111827" }, { text: "BIÊN BẢN XÁC NHẬN CÔNG VIỆC", fontSize: 8, color: "#64748b", margin: [0, 3, 0, 0] }, { text: `Số: ${reference}   •   Ngày: ${date}`, fontSize: 8, margin: [0, 5, 0, 0] }], alignment: "right" },
      ], margin: [0, 0, 0, 15] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#d1122a" }] },
      { text: "BIÊN BẢN NGHIỆM THU", bold: true, fontSize: 21, color: "#111827", alignment: "center", margin: [0, 22, 0, 5] },
      { text: "Xác nhận nội dung và trạng thái thực hiện công việc", fontSize: 9, color: "#64748b", alignment: "center", margin: [0, 0, 0, 22] },
      { table: { widths: ["*", "*", "*"], body: [
        [
          { stack: [{ text: "TASK", color: "#64748b", fontSize: 8 }, { text: task.title, bold: true, color: "#111827", margin: [0, 5, 0, 0] }] },
          { stack: [{ text: "CÔNG VIỆC", color: "#64748b", fontSize: 8 }, { text: workTaskTitle || "—", margin: [0, 5, 0, 0] }] },
          { stack: [{ text: "NGƯỜI PHỤ TRÁCH", color: "#64748b", fontSize: 8 }, { text: task.assignees.map((person) => person.name).join(", ") || "—", margin: [0, 5, 0, 0] }] },
        ],
      ] }, layout: { fillColor: () => "#f8fafc", hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 7, paddingBottom: () => 7 }, margin: [0, 0, 0, 20] },
      { columns: [{ text: "01  NỘI DUNG NGHIỆM THU", bold: true, fontSize: 11, color: "#111827" }, { text: `${entries.length} hạng mục  /  ${completed} hoàn thành`, alignment: "right", fontSize: 8, color: "#64748b" }], margin: [0, 0, 0, 10] },
      { table: { headerRows: 1, widths: [22, 120, "*", 85, 70], body: [
        ["STT", "CHI TIẾT TASK", "NỘI DUNG", "TRẠNG THÁI", "GHI CHÚ"].map((text) => ({ text, bold: true, fontSize: 8, color: "#ffffff", fillColor: "#252b36" })),
        ...entries.map((entry, index) => [
          { text: String(index + 1), color: "#64748b" },
          { text: entry.title, bold: true, color: "#111827" },
          { text: entry.description },
          { text: entry.status, bold: true, fontSize: 8, color: entry.status === "Hoàn thành" ? "#047857" : entry.status === "Làm lại" || entry.status === "Hủy bỏ" ? "#be123c" : "#92400e" },
          { text: entry.note },
        ]),
      ] }, layout: { fillColor: (row) => row === 0 ? "#252b36" : row % 2 === 0 ? "#f8fafc" : "#ffffff", hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => "#e2e8f0", paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 10, paddingBottom: () => 10 } },
      { text: "Biên bản ghi nhận trạng thái của các hạng mục được chọn tại thời điểm lập; nội dung xác nhận được thể hiện trong bảng trên.", fontSize: 8, italics: true, color: "#64748b", margin: [0, 10, 0, 22] },
      { unbreakable: true, stack: [
        { text: "02  XÁC NHẬN CÁC BÊN", bold: true, fontSize: 11, color: "#111827", margin: [0, 0, 0, 18] },
        { columns: [
          { stack: [{ text: "ĐẠI DIỆN BÀN GIAO", bold: true, color: "#111827" }, { text: "Ký và ghi rõ họ tên", italics: true, fontSize: 8, color: "#64748b", margin: [0, 5, 0, 65] }, { text: "........................................", color: "#94a3b8" }], alignment: "center" },
          { stack: [{ text: "ĐẠI DIỆN NGHIỆM THU", bold: true, color: "#111827" }, { text: "Ký và ghi rõ họ tên", italics: true, fontSize: 8, color: "#64748b", margin: [0, 5, 0, 65] }, { text: "........................................", color: "#94a3b8" }], alignment: "center" },
        ] },
      ] },
    ],
    footer: (page, total) => ({ columns: [{ text: `VIỆT NHẬT IPT  •  ${reference}`, color: "#64748b" }, { text: `Trang ${page} / ${total}`, alignment: "right", color: "#64748b" }], fontSize: 8, margin: [40, 15, 40, 0] }),
  };
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(definition).print({}, printWindow);
}
