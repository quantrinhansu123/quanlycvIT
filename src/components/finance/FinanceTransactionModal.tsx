"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, LoaderCircle, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";
import { TaskAttachmentFields } from "@/components/tasks/TaskAttachmentFields";
import { apiClient } from "@/services/api-client";
import { cn, getAppDateKey } from "@/lib/utils";
import type { FinanceCategory, FinanceFileAttachment, FinanceInput, FinanceLinkAttachment, FinanceTransaction, FinanceType } from "@/types/finance";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";
import { buildFormDraftKey, useVersionedFormDraft } from "@/hooks/useVersionedFormDraft";
import { FormDraftBanner } from "@/components/ui/FormDraftBanner";
import { runUploadBatch } from "@/lib/upload-concurrency";

interface Props {
  transaction?: FinanceTransaction;
  categories: FinanceCategory[];
  defaultType?: FinanceType;
  onClose: () => void;
  onSave: (input: FinanceInput) => Promise<void>;
}

const integerFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const MAX_RECEIPT_ITEMS = 10;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

interface PendingImage { id: string; file: File; previewUrl: string; }
interface PendingFile { id: string; file: File; }

/** Phần của FinanceInput lưu được vào bản nháp (GĐ7) — loại `receiptImages`/`receiptFiles`/`receiptLinks`. */
type FinanceDraftData = Pick<FinanceInput, "type" | "amount" | "date" | "categoryId" | "description">;

function formatMoneyInput(value: number | undefined) {
  return value ? integerFormatter.format(value) : "";
}

function isValidHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}

async function uploadImage(file: File) {
  const data = new FormData(); data.set("file", file);
  return (await apiClient.postFormData<{ url: string }>("/media/task-image", data)).url;
}

async function uploadFile(file: File): Promise<FinanceFileAttachment> {
  const data = new FormData(); data.set("file", file);
  return apiClient.postFormData<FinanceFileAttachment>("/media/task-file", data);
}

function initialForm(transaction?: FinanceTransaction, defaultType: FinanceType = "chi"): FinanceInput {
  return transaction ? {
    type: transaction.type,
    amount: transaction.amount,
    date: transaction.date.slice(0, 10),
    categoryId: transaction.categoryId,
    description: transaction.description,
    receiptImages: transaction.receiptImages,
    receiptFiles: transaction.receiptFiles,
    receiptLinks: transaction.receiptLinks,
  } : { type: defaultType, amount: 0, date: getAppDateKey(), categoryId: "", receiptImages: [], receiptFiles: [], receiptLinks: [] };
}

export function FinanceTransactionModal({ transaction, categories, defaultType = "chi", onClose, onSave }: Props) {
  const { account } = useCurrentAccount();
  // Chỉ sessionStorage (allowPersistent: false) — theo đúng kế hoạch GĐ7: giao dịch
  // tài chính không được cho tùy chọn "ghi nhớ trên thiết bị" như 3 form còn lại.
  const draftStorageKey = account
    ? buildFormDraftKey({
        accountId: account.id,
        formType: "finance-transaction",
        mode: transaction ? "edit" : "create",
        entityId: transaction?.id,
      })
    : null;
  const { draft, scheduleSave, clearDraft } = useVersionedFormDraft<FinanceDraftData>({
    storageKey: draftStorageKey,
    allowPersistent: false,
  });
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [form, setForm] = useState<FinanceInput>(() => initialForm(transaction, defaultType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [imageError, setImageError] = useState("");
  const [fileError, setFileError] = useState("");
  const [linkError, setLinkError] = useState("");
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const availableCategories = useMemo(() => categories.filter((item) => item.type === form.type), [categories, form.type]);

  useEffect(() => { pendingImagesRef.current = pendingImages; }, [pendingImages]);

  useEffect(() => {
    scheduleSave({
      type: form.type,
      amount: form.amount,
      date: form.date,
      categoryId: form.categoryId,
      description: form.description,
    });
  }, [form.type, form.amount, form.date, form.categoryId, form.description, scheduleSave]);

  useEffect(() => () => {
    for (const image of pendingImagesRef.current) URL.revokeObjectURL(image.previewUrl);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handleKey); };
  }, [onClose, saving]);

  function setType(type: FinanceType) {
    const firstCategory = categories.find((item) => item.type === type);
    setForm((current) => ({ ...current, type, categoryId: firstCategory?.id ?? "" }));
  }

  function selectImages(files: FileList | null) {
    if (!files?.length) return;
    const savedImages = form.receiptImages ?? [];
    const available = MAX_RECEIPT_ITEMS - savedImages.length - pendingImages.length;
    if (available <= 0) return setImageError(`Mỗi giao dịch chỉ được lưu tối đa ${MAX_RECEIPT_ITEMS} ảnh chứng từ.`);
    const selected = Array.from(files);
    const invalid = selected.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
    if (invalid) return setImageError("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF.");
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_IMAGE_SIZE);
    if (oversized) return setImageError(`Ảnh “${oversized.name}” phải có dung lượng tối đa 10 MB.`);
    const next = selected.slice(0, available).map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) }));
    setPendingImages((current) => [...current, ...next]);
    setImageError(selected.length > available ? `Chỉ thêm ${available} ảnh để không vượt quá ${MAX_RECEIPT_ITEMS} ảnh.` : "");
  }

  function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    const savedFiles = form.receiptFiles ?? [];
    const available = MAX_RECEIPT_ITEMS - savedFiles.length - pendingFiles.length;
    if (available <= 0) return setFileError(`Mỗi giao dịch chỉ được lưu tối đa ${MAX_RECEIPT_ITEMS} tệp chứng từ.`);
    const selected = Array.from(files);
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_FILE_SIZE);
    if (oversized) return setFileError(`Tệp “${oversized.name}” phải có dung lượng tối đa 20 MB.`);
    setPendingFiles((current) => [...current, ...selected.slice(0, available).map((file) => ({ id: crypto.randomUUID(), file }))]);
    setFileError(selected.length > available ? `Chỉ thêm ${available} tệp để không vượt quá ${MAX_RECEIPT_ITEMS} tệp.` : "");
  }

  function removePendingImage(id: string) {
    setPendingImages((current) => { const target = current.find((item) => item.id === id); if (target) URL.revokeObjectURL(target.previewUrl); return current.filter((item) => item.id !== id); });
    setImageError("");
  }

  function normalizedLinks() {
    return (form.receiptLinks ?? []).map((link) => ({ label: link.label?.trim() || undefined, url: link.url.trim(), description: link.description?.trim() || undefined })).filter((link) => link.url);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(form.amount) || form.amount <= 0) return setError("Vui lòng nhập số tiền lớn hơn 0.");
    if (!form.date || !form.categoryId) return setError("Vui lòng chọn ngày và danh mục giao dịch.");
    const links = normalizedLinks();
    if (links.some((link) => !isValidHttpUrl(link.url))) return setLinkError("Liên kết chứng từ không hợp lệ.");
    setSaving(true); setError("");
    try {
      const images: string[] = [];
      const files: FinanceFileAttachment[] = [];
      const uploadResult = await runUploadBatch([
        ...pendingImages.map((item) => ({
          id: item.id,
          upload: async () => { images.push(await uploadImage(item.file)); },
        })),
        ...pendingFiles.map((item) => ({
          id: item.id,
          upload: async () => { files.push(await uploadFile(item.file)); },
        })),
      ]);
      const uploadedIds = new Set(uploadResult.succeededIds);
      if (images.length || files.length) {
        setForm((current) => ({
          ...current,
          receiptImages: [...(current.receiptImages ?? []), ...images],
          receiptFiles: [...(current.receiptFiles ?? []), ...files],
        }));
        setPendingImages((current) => current.filter((item) => {
          if (!uploadedIds.has(item.id)) return true;
          URL.revokeObjectURL(item.previewUrl);
          return false;
        }));
        setPendingFiles((current) => current.filter((item) => !uploadedIds.has(item.id)));
      }
      if (uploadResult.failures.length) {
        throw new Error(`Không thể tải ${uploadResult.failures.length} tệp. Các tệp đã tải xong được giữ lại; bấm Lưu để thử lại tệp lỗi.`);
      }
      await onSave({ ...form, receiptImages: [...(form.receiptImages ?? []), ...images], receiptFiles: [...(form.receiptFiles ?? []), ...files], receiptLinks: links });
      clearDraft();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu giao dịch.");
      setSaving(false);
    }
  }

  const inputClass = "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  return (
    <div className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form onSubmit={submit} className="account-dialog flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" aria-labelledby="transaction-title">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div><h2 id="transaction-title" className="text-lg font-bold text-gray-900">{transaction ? "Chỉnh sửa giao dịch" : "Thêm giao dịch mới"}</h2><p className="mt-1 text-xs text-gray-500">Ghi nhận khoản thu hoặc chi của văn phòng</p></div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {draft && !draftBannerDismissed && (
            <FormDraftBanner
              savedAt={draft.savedAt}
              conflict={draft.conflict}
              onRestore={() => {
                setForm((prev) => ({ ...prev, ...draft.data }));
                setDraftBannerDismissed(true);
              }}
              onDiscard={() => {
                clearDraft();
                setDraftBannerDismissed(true);
              }}
            />
          )}
          <fieldset><legend className="mb-2 text-xs font-semibold text-gray-600">Loại giao dịch</legend><div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <TypeButton active={form.type === "thu"} type="thu" onClick={() => setType("thu")} />
            <TypeButton active={form.type === "chi"} type="chi" onClick={() => setType("chi")} />
          </div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Số tiền" required><div className="relative"><input autoFocus inputMode="numeric" className={cn(inputClass, "pr-14 text-base font-semibold")} value={formatMoneyInput(form.amount)} onChange={(e) => setForm((current) => ({ ...current, amount: Number(e.target.value.replace(/\D/g, "")) }))} placeholder="0" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">VNĐ</span></div></Field>
            <Field label="Ngày giao dịch" required><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))} /></Field>
          </div>
          <Field label="Danh mục" required>
            <SingleSelectDropdown
              value={form.categoryId}
              onChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))}
              placeholder="Chọn danh mục"
              emptyHint={`Chưa có danh mục ${form.type === "thu" ? "thu" : "chi"}`}
              searchable
              searchPlaceholder="Tìm danh mục..."
              options={availableCategories.map((item) => ({
                value: item.id,
                label: item.name,
                sublabel: item.type === "thu" ? "Khoản thu" : "Khoản chi",
                dotClassName: item.type === "thu" ? "bg-emerald-500" : "bg-rose-500",
              }))}
            />
          </Field>
          <Field label="Nội dung"><div className="relative"><ReceiptText className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><textarea className={cn(inputClass, "h-24 resize-none py-2.5 pl-10")} maxLength={500} value={form.description ?? ""} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Ví dụ: Thanh toán tiền điện tháng 7" /></div></Field>
          <TaskAttachmentFields
            label="Chứng từ"
            entityLabel="chứng từ"
            files={form.receiptFiles ?? []}
            pendingFiles={pendingFiles}
            links={form.receiptLinks ?? []}
            images={form.receiptImages ?? []}
            pendingImages={pendingImages}
            maxFiles={MAX_RECEIPT_ITEMS}
            maxLinks={MAX_RECEIPT_ITEMS}
            maxImages={MAX_RECEIPT_ITEMS}
            submitting={saving}
            fileError={fileError}
            linkError={linkError}
            imageError={imageError}
            onSelectFiles={selectFiles}
            onSelectImages={selectImages}
            onAddLink={() => { setForm((current) => ({ ...current, receiptLinks: [...(current.receiptLinks ?? []), { url: "" }] })); setLinkError(""); }}
            onUpdateLink={(index, patch) => { setForm((current) => ({ ...current, receiptLinks: (current.receiptLinks ?? []).map((link, itemIndex) => itemIndex === index ? { ...link, ...patch } : link) as FinanceLinkAttachment[] })); setLinkError(""); }}
            onRemoveLink={(index) => setForm((current) => ({ ...current, receiptLinks: (current.receiptLinks ?? []).filter((_, itemIndex) => itemIndex !== index) }))}
            onRemoveSavedFile={(url) => setForm((current) => ({ ...current, receiptFiles: (current.receiptFiles ?? []).filter((file) => file.url !== url) }))}
            onRemovePendingFile={(id) => { setPendingFiles((current) => current.filter((item) => item.id !== id)); setFileError(""); }}
            onRemoveSavedImage={(url) => setForm((current) => ({ ...current, receiptImages: (current.receiptImages ?? []).filter((image) => image !== url) }))}
            onRemovePendingImage={removePendingImage}
          />
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        </div>
        <footer className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4 sm:px-6"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving || availableCategories.length === 0}>{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{saving ? "Đang lưu..." : transaction ? "Lưu thay đổi" : "Thêm giao dịch"}</Button></footer>
      </form>
    </div>
  );
}

function TypeButton({ active, type, onClick }: { active: boolean; type: FinanceType; onClick: () => void }) {
  const Icon = type === "thu" ? ArrowUpCircle : ArrowDownCircle;
  return <button type="button" onClick={onClick} className={cn("flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition", active ? type === "thu" ? "bg-white text-emerald-600 shadow-sm" : "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-800")}><Icon className="h-4 w-4" />{type === "thu" ? "Khoản thu" : "Khoản chi"}</button>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-600">{label} {required && <span className="text-rose-500">*</span>}</span>{children}</label>;
}
