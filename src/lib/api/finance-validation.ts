import { ApiException } from "@/lib/api/response";
import type { FinanceCategoryInput, FinanceFileAttachment, FinanceInput, FinanceLinkAttachment, FinanceType } from "@/types/finance";
const types = new Set<FinanceType>(["thu", "chi"]);
const date = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECEIPTS = 10;

function isHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

function receiptImages(body: Record<string, unknown>): string[] {
  const value = body.receiptImages;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ApiException("Danh sách ảnh chứng từ không hợp lệ.");
  const images = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (images.length > MAX_RECEIPTS || images.some((url) => !isHttpUrl(url))) throw new ApiException("Ảnh chứng từ không hợp lệ hoặc vượt quá 10 ảnh.");
  return images;
}

function receiptFiles(body: Record<string, unknown>): FinanceFileAttachment[] {
  const value = body.receiptFiles;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_RECEIPTS) throw new ApiException("Tệp chứng từ không hợp lệ hoặc vượt quá 10 tệp.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiException("Tệp chứng từ không hợp lệ.");
    const entry = item as Record<string, unknown>;
    if (typeof entry.name !== "string" || !entry.name.trim() || typeof entry.url !== "string" || !isHttpUrl(entry.url.trim())) throw new ApiException("Tệp chứng từ phải có tên và đường dẫn hợp lệ.");
    return { name: entry.name.trim(), url: entry.url.trim() };
  });
}

function receiptLinks(body: Record<string, unknown>): FinanceLinkAttachment[] {
  const value = body.receiptLinks;
  const legacyUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : "";
  if (value === undefined || value === null) return legacyUrl ? [{ url: legacyUrl }] : [];
  if (!Array.isArray(value) || value.length > MAX_RECEIPTS) throw new ApiException("Liên kết chứng từ không hợp lệ hoặc vượt quá 10 liên kết.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiException("Liên kết chứng từ không hợp lệ.");
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string" || !isHttpUrl(entry.url.trim())) throw new ApiException("Liên kết chứng từ phải có đường dẫn hợp lệ.");
    return { label: typeof entry.label === "string" ? entry.label.trim() || undefined : undefined, url: entry.url.trim(), description: typeof entry.description === "string" ? entry.description.trim() || undefined : undefined };
  });
}

export function parseFinanceInput(body: Record<string, unknown>): FinanceInput {
  const type = body.type; const amount = body.amount; const transactionDate = body.date; const categoryId = body.categoryId;
  if (typeof type !== "string" || !types.has(type as FinanceType)) throw new ApiException("Loại giao dịch không hợp lệ.");
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new ApiException("Số tiền phải lớn hơn 0.");
  if (typeof transactionDate !== "string" || !date.test(transactionDate)) throw new ApiException("Ngày giao dịch không hợp lệ.");
  if (typeof categoryId !== "string" || !categoryId) throw new ApiException("Vui lòng chọn danh mục.");
  return { type: type as FinanceType, amount, date: transactionDate, categoryId, description: typeof body.description === "string" ? body.description.trim() || undefined : undefined, receiptImages: receiptImages(body), receiptFiles: receiptFiles(body), receiptLinks: receiptLinks(body) };
}

export function parseFinanceCategoryInput(body: Record<string, unknown>): FinanceCategoryInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const monthlyBudget = body.monthlyBudget;
  if (!name || name.length > 100) throw new ApiException("Tên danh mục phải có từ 1 đến 100 ký tự.");
  if (typeof type !== "string" || !types.has(type as FinanceType)) throw new ApiException("Loại danh mục không hợp lệ.");
  if (monthlyBudget !== undefined && (typeof monthlyBudget !== "number" || !Number.isFinite(monthlyBudget) || monthlyBudget < 0)) {
    throw new ApiException("Ngân sách tháng phải là số không âm.");
  }
  return { name, type: type as FinanceType, monthlyBudget: monthlyBudget || undefined };
}
