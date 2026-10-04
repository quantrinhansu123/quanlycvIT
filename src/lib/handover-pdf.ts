import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { loadPdfMake } from "@/lib/pdf-export";

export interface HandoverPrintRow {
  label: string;
  content: string;
  statusLabel: string;
  handedOver: boolean;
  imageUrls: string[];
}

export interface HandoverPrintInput {
  taskTitle: string;
  workTaskTitle?: string;
  assignees: string;
  tester?: string;
  dueDate?: string;
  note: string;
  handoverImageUrl: string;
  rows: HandoverPrintRow[];
}

const PAGE_IMAGE_FIT: [number, number] = [500, 320];
const MAX_IMAGES = 8;

function generatedAtLabel(): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

function fileSlug(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "task";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Không đọc được ảnh."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được ảnh."));
    reader.readAsDataURL(blob);
  });
}

async function compressDataUrl(dataUrl: string): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const maxWidth = 1200;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function loadPrintableImage(url: string): Promise<string | null> {
  if (!isHttpUrl(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await blobToDataUrl(blob);
    try {
      return await compressDataUrl(dataUrl);
    } catch {
      return dataUrl;
    }
  } catch {
    return null;
  }
}

function metaLine(label: string, value: string): Content {
  return {
    text: [
      { text: `${label}: `, bold: true },
      { text: value || "—" },
    ],
    fontSize: 10,
    color: "#334155",
    margin: [0, 1, 0, 0],
  };
}

function imageBlock(dataUrl: string | null, fallbackUrl: string): Content[] {
  if (dataUrl) {
    return [{ image: dataUrl, fit: PAGE_IMAGE_FIT, margin: [0, 4, 0, 8] }];
  }
  if (!fallbackUrl) return [];
  return [{
    text: `Không nhúng được ảnh. Đường dẫn: ${fallbackUrl}`,
    fontSize: 9,
    color: "#b45309",
    margin: [0, 2, 0, 8],
  }];
}

export async function exportHandoverPdf(input: HandoverPrintInput): Promise<void> {
  const urls = [
    input.handoverImageUrl,
    ...input.rows.flatMap((row) => row.imageUrls),
  ].map((url) => url.trim()).filter((url, index, all) => url && all.indexOf(url) === index).slice(0, MAX_IMAGES);
  const images = new Map<string, string | null>();
  await Promise.all(urls.map(async (url) => {
    images.set(url, await loadPrintableImage(url));
  }));

  const content: Content[] = [
    metaLine("Task", input.taskTitle),
    ...(input.workTaskTitle ? [metaLine("Công việc", input.workTaskTitle)] : []),
    metaLine("Người thực hiện", input.assignees || "—"),
    ...(input.tester ? [metaLine("Người nghiệm thu", input.tester)] : []),
    ...(input.dueDate ? [metaLine("Hạn hoàn thành", input.dueDate)] : []),
  ];

  for (const row of input.rows) {
    content.push({
      text: row.label,
      bold: true,
      fontSize: 12,
      color: "#111827",
      margin: [0, 14, 0, 4],
    });
    content.push({ text: "Nội dung", bold: true, fontSize: 9, color: "#64748b" });
    content.push({
      text: row.content.trim() || "Chưa có mô tả.",
      fontSize: 11,
      color: "#1f2937",
      margin: [0, 2, 0, 6],
    });
    for (const url of row.imageUrls) {
      content.push(...imageBlock(images.get(url.trim()) ?? null, url.trim()));
    }
    content.push({
      text: [
        { text: "Trạng thái: ", bold: true, color: "#334155" },
        { text: row.statusLabel, bold: true, color: row.handedOver ? "#047857" : "#b45309" },
      ],
      fontSize: 11,
      margin: [0, 0, 0, 2],
    });
  }

  content.push({ text: "Ảnh bàn giao", bold: true, fontSize: 12, color: "#111827", margin: [0, 16, 0, 4] });
  if (input.handoverImageUrl.trim()) {
    content.push(...imageBlock(images.get(input.handoverImageUrl.trim()) ?? null, input.handoverImageUrl.trim()));
  } else {
    content.push({ text: "Chưa có ảnh bàn giao.", italics: true, fontSize: 10, color: "#64748b", margin: [0, 0, 0, 8] });
  }
  if (input.note.trim()) {
    content.push({ text: "Ghi chú bàn giao", bold: true, fontSize: 9, color: "#64748b", margin: [0, 4, 0, 2] });
    content.push({ text: input.note.trim(), fontSize: 11, color: "#1f2937", margin: [0, 0, 0, 8] });
  }

  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e5e7eb" }],
    margin: [0, 16, 0, 10],
  });
  content.push({ text: "Nghiệm thu", bold: true, fontSize: 12, margin: [0, 0, 0, 12] });
  content.push({
    columns: [
      { stack: [{ text: "Người bàn giao", bold: true, fontSize: 10 }, { text: "Ký, ghi rõ họ tên", fontSize: 9, color: "#64748b", margin: [0, 28, 0, 0] }] },
      { stack: [{ text: "Người nghiệm thu", bold: true, fontSize: 10 }, { text: "Ký, ghi rõ họ tên", fontSize: 9, color: "#64748b", margin: [0, 28, 0, 0] }] },
    ],
  });

  const generatedAt = generatedAtLabel();
  const documentDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [40, 72, 40, 42],
    defaultStyle: { font: "Roboto" },
    header: {
      margin: [40, 18, 40, 0],
      stack: [
        { text: "BIÊN BẢN BÀN GIAO", fontSize: 16, bold: true, color: "#111827" },
        { text: "Dùng để xem và nghiệm thu", fontSize: 9, color: "#64748b", margin: [0, 2, 0, 0] },
        { text: `Tạo lúc ${generatedAt}`, fontSize: 8, color: "#94a3b8", margin: [0, 2, 0, 0] },
      ],
    },
    footer: (currentPage, pageCount) => ({
      margin: [40, 8, 40, 0],
      columns: [
        { text: "IT Việt Nhật · Khổ A4 dọc", fontSize: 8, color: "#94a3b8" },
        { text: `Trang ${currentPage}/${pageCount}`, alignment: "right", fontSize: 8, color: "#64748b" },
      ],
    }),
    content,
    info: {
      title: `Biên bản bàn giao - ${input.taskTitle}`,
      author: "IT Việt Nhật",
      subject: "Bàn giao và nghiệm thu",
    },
  };

  const pdfMake = await loadPdfMake();
  const filename = `ban-giao-${fileSlug(input.taskTitle)}.pdf`;
  pdfMake.createPdf(documentDefinition).download(filename);
}
