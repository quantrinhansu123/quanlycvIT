import type {
  Content,
  CustomTableLayout,
  StyleDictionary,
  TDocumentDefinitions,
  TableCell,
} from "pdfmake/interfaces";

export interface PdfTableColumn {
  label: string;
  width?: number | "auto" | "*";
  alignment?: "left" | "center" | "right";
}

interface ExportTablePdfOptions {
  title: string;
  filename: string;
  columns: PdfTableColumn[];
  rows: Array<Array<string | number | null | undefined>>;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
}

const styles: StyleDictionary = {
  title: { fontSize: 17, bold: true, color: "#111827" },
  subtitle: { fontSize: 9, color: "#64748b", margin: [0, 3, 0, 0] },
  tableHeader: { bold: true, fontSize: 8, color: "#ffffff" },
  tableCell: { fontSize: 7.5, color: "#334155", lineHeight: 1.15 },
};

const tableLayout: CustomTableLayout = {
  fillColor: (rowIndex) => rowIndex === 0 ? "#d1122a" : rowIndex % 2 === 0 ? "#fff7f7" : "#ffffff",
  hLineColor: () => "#e5e7eb",
  vLineColor: () => "#e5e7eb",
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export async function loadPdfMake() {
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const fontModule = pdfFonts as unknown as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> };
  pdfMake.vfs = fontModule.pdfMake?.vfs ?? fontModule.vfs ?? fontModule as unknown as Record<string, string>;
  return pdfMake;
}

export async function exportTablePdf({
  title,
  filename,
  columns,
  rows,
  subtitle,
  orientation = columns.length > 6 ? "landscape" : "portrait",
}: ExportTablePdfOptions): Promise<void> {
  const pdfMake = await loadPdfMake();

  const generatedAt = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const headerRow: TableCell[] = columns.map((column) => ({
    text: column.label,
    style: "tableHeader",
    alignment: column.alignment ?? "left",
  }));
  const body: TableCell[][] = [
    headerRow,
    ...rows.map((row) => columns.map((column, index) => ({
      text: text(row[index]),
      style: "tableCell",
      alignment: column.alignment ?? "left",
    }))),
  ];
  const emptyContent: Content[] = rows.length === 0
    ? [{ text: "Không có dữ liệu phù hợp để xuất.", margin: [0, 18, 0, 0], color: "#64748b", italics: true }]
    : [];

  const documentDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: orientation,
    pageMargins: [28, 70, 28, 38],
    defaultStyle: { font: "Roboto" },
    styles,
    header: {
      margin: [28, 20, 28, 0],
      columns: [
        {
          stack: [
            { text: title.toUpperCase(), style: "title" },
            { text: subtitle ?? `Tổng số: ${rows.length} bản ghi`, style: "subtitle" },
          ],
        },
        { text: `Xuất lúc ${generatedAt}`, alignment: "right", fontSize: 8, color: "#64748b", margin: [0, 4, 0, 0] },
      ],
    },
    footer: (currentPage, pageCount) => ({
      margin: [28, 8, 28, 0],
      columns: [
        { text: "IT Việt Nhật", fontSize: 8, color: "#94a3b8" },
        { text: `Trang ${currentPage}/${pageCount}`, alignment: "right", fontSize: 8, color: "#64748b" },
      ],
    }),
    content: rows.length > 0 ? [{
      table: {
        headerRows: 1,
        widths: columns.map((column) => column.width ?? "*"),
        body,
        dontBreakRows: true,
      },
      layout: tableLayout,
    }] : emptyContent,
    info: { title, author: "IT Việt Nhật", subject: subtitle ?? title },
  };

  pdfMake.createPdf(documentDefinition).download(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
