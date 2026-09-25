"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ClipboardPaste,
  Copy,
  ImagePlus,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { ImagePreviewDialog, type PreviewImage } from "@/components/ui/ImagePreviewDialog";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { subtaskService } from "@/services/subtask-service";
import type { SubtaskPromptItem } from "@/types/subtask";

const MAX_PROMPT_ITEMS = 30;
const MAX_IMAGES_PER_ITEM = 10;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type SaveStatus = "idle" | "saving" | "saved" | "error";

function emptyItem(id = crypto.randomUUID()): SubtaskPromptItem {
  return { id, content: "", imageUrls: [], status: "unprocessed" };
}

function itemImageUrls(item: SubtaskPromptItem): string[] {
  return item.imageUrls ?? [];
}

function fitPromptTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function combinedPrompt(item: SubtaskPromptItem): string {
  return [item.content.trim(), ...itemImageUrls(item)].filter(Boolean).join("\n");
}

function mergeSelectedPrompts(items: SubtaskPromptItem[]): string {
  return items
    .map((item) => combinedPrompt(item))
    .filter(Boolean)
    .join("\n\n");
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

interface SubtaskPromptPanelProps {
  subtaskId: string;
  initialItems: SubtaskPromptItem[];
  initialDataLoaded?: boolean;
  importRequest?: SubtaskPromptImportRequest | null;
  onImported?: (requestId: string) => void;
}

export interface SubtaskPromptImportRequest {
  requestId: string;
  content: string;
  imageUrls: string[];
}

export function SubtaskPromptPanel({
  subtaskId,
  initialItems,
  initialDataLoaded = false,
  importRequest,
  onImported,
}: SubtaskPromptPanelProps) {
  const { notify } = useFeedback();
  const initial = initialItems.length > 0 ? initialItems : [emptyItem(`prompt-empty-${subtaskId}`)];
  const [items, setItems] = useState<SubtaskPromptItem[]>(initial);
  const itemsRef = useRef(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [copiedMerged, setCopiedMerged] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const hasEditedRef = useRef(false);

  useEffect(() => {
    // SSR chi tiết đã kèm prompt_items — bỏ GET trùng khi đã có dữ liệu.
    const hasInitialPrompts = initialDataLoaded || initialItems.some(
      (item) => item.content.trim() || (item.imageUrls?.length ?? 0) > 0
    );
    if (hasInitialPrompts) return;

    let active = true;
    void subtaskService.getPromptItems(subtaskId).then((savedItems) => {
      if (!active || hasEditedRef.current || savedItems.length === 0) return;
      itemsRef.current = savedItems;
      setItems(savedItems);
      setSelectedIds([]);
    }).catch(() => {
      // Trang vẫn dùng được khi deployment chưa áp dụng migration Prompt.
    });
    return () => {
      active = false;
    };
    // Chỉ refetch theo task; initialItems lấy từ lần mount (SSR / remount sau update).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tránh refetch khi parent re-render
  }, [subtaskId, initialDataLoaded]);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const mergedPrompt = mergeSelectedPrompts(selectedItems);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  function replaceItems(next: SubtaskPromptItem[]) {
    itemsRef.current = next;
    setItems(next);
    setSelectedIds((current) => current.filter((id) => next.some((item) => item.id === id)));
  }

  function persist(next: SubtaskPromptItem[]) {
    const generation = ++saveGenerationRef.current;
    setSaveStatus("saving");
    const payload = next.filter((item) => item.content.trim() || itemImageUrls(item).length > 0);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await subtaskService.updatePromptItems(subtaskId, payload);
        if (saveGenerationRef.current === generation) setSaveStatus("saved");
      })
      .catch((error) => {
        if (saveGenerationRef.current === generation) setSaveStatus("error");
        notify({
          type: "error",
          title: "Không thể lưu Prompt",
          description: getErrorMessage(error, "Vui lòng thử lại."),
        });
      });
  }

  function updateItem(id: string, patch: Partial<SubtaskPromptItem>, save = false) {
    hasEditedRef.current = true;
    const next = itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item));
    replaceItems(next);
    if (save) persist(next);
  }

  function addItem() {
    if (itemsRef.current.length >= MAX_PROMPT_ITEMS) return;
    hasEditedRef.current = true;
    const next = [...itemsRef.current, emptyItem()];
    replaceItems(next);
  }

  function removeItem(id: string) {
    hasEditedRef.current = true;
    const remaining = itemsRef.current.filter((item) => item.id !== id);
    const next = remaining.length > 0 ? remaining : [emptyItem()];
    replaceItems(next);
    persist(remaining);
  }

  function removeImage(itemId: string, imageUrl: string) {
    const current = itemsRef.current.find((item) => item.id === itemId);
    if (!current) return;
    updateItem(itemId, { imageUrls: itemImageUrls(current).filter((url) => url !== imageUrl) }, true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    );
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
  }

  async function uploadImages(itemId: string, files: File[]) {
    if (files.length === 0) return;
    hasEditedRef.current = true;

    const current = itemsRef.current.find((item) => item.id === itemId);
    if (!current) return;
    const existing = itemImageUrls(current);
    const availableSlots = MAX_IMAGES_PER_ITEM - existing.length;
    if (availableSlots <= 0) {
      notify({
        type: "error",
        title: "Đã đủ ảnh",
        description: `Mỗi yêu cầu chỉ được tối đa ${MAX_IMAGES_PER_ITEM} ảnh.`,
      });
      return;
    }

    const selected = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      notify({
        type: "error",
        title: "Vượt giới hạn ảnh",
        description: `Chỉ thêm ${availableSlots} ảnh để không vượt quá ${MAX_IMAGES_PER_ITEM} ảnh.`,
      });
    }

    for (const file of selected) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        notify({ type: "error", title: "Ảnh không hợp lệ", description: "Chỉ hỗ trợ JPG, PNG, WEBP hoặc AVIF." });
        return;
      }
      if (file.size === 0 || file.size > 10 * 1024 * 1024) {
        notify({ type: "error", title: "Ảnh không hợp lệ", description: "Ảnh phải có dung lượng từ 1 byte đến 10 MB." });
        return;
      }
    }

    setUploadingIds((currentIds) => new Set(currentIds).add(itemId));
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        uploaded.push(await subtaskService.uploadImage(file));
      }
      const next = itemsRef.current.map((item) =>
        item.id === itemId
          ? { ...item, imageUrls: [...itemImageUrls(item), ...uploaded].slice(0, MAX_IMAGES_PER_ITEM) }
          : item
      );
      replaceItems(next);
      persist(next);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể tải ảnh lên Cloudinary",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setUploadingIds((currentIds) => {
        const next = new Set(currentIds);
        next.delete(itemId);
        return next;
      });
    }
  }

  async function handleCopyMerged() {
    if (!mergedPrompt) return;
    try {
      await copyToClipboard(mergedPrompt);
      setCopiedMerged(true);
      window.setTimeout(() => setCopiedMerged(false), 1500);
      notify({ type: "success", title: "Đã sao chép Prompt ghép" });
    } catch {
      notify({ type: "error", title: "Không thể sao chép", description: "Hãy chọn nội dung và sao chép thủ công." });
    }
  }

  useEffect(() => {
    if (!importRequest) return;

    const content = importRequest.content.trim();
    const imageUrls = [...new Set(importRequest.imageUrls.filter(Boolean))].slice(0, MAX_IMAGES_PER_ITEM);
    const current = itemsRef.current;
    const emptyIndex = current.findIndex(
      (item) => !item.content.trim() && itemImageUrls(item).length === 0
    );

    if (emptyIndex < 0 && current.length >= MAX_PROMPT_ITEMS) {
      notify({
        type: "error",
        title: "Prompt đã đủ yêu cầu",
        description: `Chỉ được lưu tối đa ${MAX_PROMPT_ITEMS} yêu cầu.`,
      });
      onImported?.(importRequest.requestId);
      return;
    }

    hasEditedRef.current = true;
    const importedItem: SubtaskPromptItem = {
      id: crypto.randomUUID(),
      content,
      imageUrls,
      status: "unprocessed",
    };
    const next = emptyIndex >= 0
      ? current.map((item, index) => index === emptyIndex ? importedItem : item)
      : [...current, importedItem];

    replaceItems(next);
    setSelectedIds((selected) => [...new Set([...selected, importedItem.id])]);
    persist(next);
    notify({
      type: "success",
      title: "Đã đưa vào Prompt",
      description: `Đã thêm nội dung và ${imageUrls.length} ảnh tương ứng.`,
    });
    onImported?.(importRequest.requestId);
    // Mỗi requestId chỉ được nhập một lần; các hàm lưu dùng dữ liệu mới nhất từ ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRequest?.requestId]);

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm [contain:inline-size]">
      <div className="h-1 bg-sky-500" />
      <div className="p-4 @md/detail:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <MessageSquareText className="h-4 w-4 text-sky-600" />
              Prompt
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Nhập yêu cầu, tải nhiều ảnh (mỗi ảnh một link Cloudinary). Tick chọn để ghép Prompt rồi sao chép.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn(
              "text-xs",
              saveStatus === "error" ? "text-rose-600" : saveStatus === "saved" ? "text-emerald-600" : "text-gray-400"
            )}>
              {saveStatus === "saving" && "Đang lưu..."}
              {saveStatus === "saved" && "Đã lưu"}
              {saveStatus === "error" && "Lưu thất bại"}
            </span>
            <button
              type="button"
              onClick={addItem}
              disabled={items.length >= MAX_PROMPT_ITEMS}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Thêm yêu cầu
            </button>
          </div>
        </div>

        <div className="mt-5 w-0 min-w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-gray-200 [contain:inline-size]">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    disabled={items.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    aria-label="Chọn tất cả yêu cầu"
                  />
                </th>
                <th className="w-12 whitespace-nowrap px-2 py-3">#</th>
                <th className="min-w-[220px] px-2 py-3">Nội dung yêu cầu</th>
                <th className="min-w-[260px] whitespace-nowrap px-2 py-3">Ảnh tham chiếu</th>
                <th className="w-[140px] whitespace-nowrap px-2 py-3">Trạng thái</th>
                <th className="w-12 px-2 py-3 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, index) => {
                const uploading = uploadingIds.has(item.id);
                const selected = selectedIds.includes(item.id);
                const images = itemImageUrls(item);
                const canAddMore = images.length < MAX_IMAGES_PER_ITEM;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "align-top transition",
                      selected ? "bg-sky-50/60" : "bg-white hover:bg-gray-50/80"
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                        aria-label={`Chọn yêu cầu ${index + 1}`}
                      />
                    </td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-500">{index + 1}</td>
                    <td className="px-2 py-3">
                      <textarea
                        ref={fitPromptTextarea}
                        value={item.content}
                        onChange={(event) => {
                          fitPromptTextarea(event.currentTarget);
                          updateItem(item.id, { content: event.target.value });
                        }}
                        onBlur={() => persist(itemsRef.current)}
                        maxLength={5000}
                        rows={3}
                        placeholder="Gõ nội dung yêu cầu..."
                        className="min-h-20 w-full resize-y rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm leading-5 text-gray-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="space-y-2">
                        {images.length > 0 && (
                          <div className="grid grid-cols-2 gap-1.5">
                            {images.map((url, imageIndex) => (
                              <div
                                key={`${url}-${imageIndex}`}
                                className="group relative overflow-hidden rounded-lg border border-sky-100 bg-white"
                              >
                                {/* URL Cloudinary động nên dùng img thay vì giới hạn hostname của next/image. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={`Ảnh ${imageIndex + 1} yêu cầu ${index + 1}`}
                                  className="h-14 w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage({
                                    name: `Ảnh ${imageIndex + 1} yêu cầu ${index + 1}`,
                                    url,
                                  })}
                                  className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-md bg-black/65 text-white opacity-90 shadow-sm transition hover:bg-sky-600 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white"
                                  aria-label={`Phóng to ảnh tham chiếu ${imageIndex + 1} của yêu cầu ${index + 1}`}
                                  title="Xem ảnh lớn"
                                >
                                  <ZoomIn className="h-4 w-4" />
                                </button>
                                <p className="truncate px-1.5 py-1 text-[9px] leading-tight text-sky-700" title={url}>
                                  {url}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeImage(item.id, url)}
                                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                                  aria-label={`Xóa ảnh ${imageIndex + 1}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <label
                          className={cn(
                            "flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-white px-2 py-2 text-center outline-none transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100",
                            !canAddMore || uploading
                              ? "cursor-not-allowed border-gray-200 opacity-60"
                              : images.length > 0
                                ? "border-sky-200 hover:border-sky-400 hover:bg-sky-50/40"
                                : "border-gray-300 hover:border-sky-400 hover:bg-sky-50/40"
                          )}
                          tabIndex={canAddMore && !uploading ? 0 : -1}
                          onPaste={(event) => {
                            if (!canAddMore || uploading) return;
                            const pasted = Array.from(event.clipboardData.items)
                              .filter((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
                              .map((entry) => entry.getAsFile())
                              .filter((file): file is File => Boolean(file));
                            if (pasted.length === 0) return;
                            event.preventDefault();
                            void uploadImages(item.id, pasted);
                          }}
                        >
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            multiple
                            className="sr-only"
                            disabled={uploading || !canAddMore}
                            onChange={(event) => {
                              const files = Array.from(event.target.files ?? []);
                              if (files.length > 0) void uploadImages(item.id, files);
                              event.target.value = "";
                            }}
                          />
                          {uploading ? (
                            <>
                              <LoaderCircle className="h-5 w-5 animate-spin text-sky-600" />
                              <span className="mt-1 text-[10px] font-semibold text-sky-700">Đang tải lên Cloudinary...</span>
                            </>
                          ) : (
                            <>
                              <ImagePlus className="h-4 w-4 text-sky-600" />
                              <span className="mt-1 text-[10px] font-semibold text-gray-600">
                                {canAddMore
                                  ? images.length > 0
                                    ? `Thêm ảnh (${images.length}/${MAX_IMAGES_PER_ITEM})`
                                    : "Chọn nhiều ảnh / Ctrl+V"
                                  : `Đã đủ ${MAX_IMAGES_PER_ITEM} ảnh`}
                              </span>
                              {canAddMore && (
                                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                                  <ClipboardPaste className="h-2.5 w-2.5" /> Mỗi ảnh → 1 link
                                </span>
                              )}
                            </>
                          )}
                        </label>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={item.status}
                        onChange={(event) => updateItem(
                          item.id,
                          { status: event.target.value as SubtaskPromptItem["status"] },
                          true
                        )}
                        className={cn(
                          "h-9 w-full rounded-lg border bg-white px-2 text-xs font-semibold outline-none transition focus:ring-2",
                          item.status === "unprocessed"
                            ? "border-amber-200 text-amber-700 focus:border-amber-400 focus:ring-amber-100"
                            : item.status === "processed"
                              ? "border-emerald-200 text-emerald-700 focus:border-emerald-400 focus:ring-emerald-100"
                              : "border-sky-200 text-sky-700 focus:border-sky-400 focus:ring-sky-100"
                        )}
                      >
                        <option value="unprocessed">Chưa xử lý</option>
                        <option value="processed">Đã xử lý</option>
                        <option value="completed">Đã hoàn thành</option>
                      </select>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Xóa yêu cầu ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/50 p-3 @md/detail:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-sky-800">Prompt ghép</span>
              <p className="mt-0.5 text-[11px] text-sky-700/80">
                {selectedIds.length === 0
                  ? "Tick chọn một hoặc nhiều yêu cầu để ghép Prompt."
                  : `Đã chọn ${selectedIds.length} yêu cầu`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyMerged()}
              disabled={!mergedPrompt}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copiedMerged ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedMerged ? "Đã sao chép" : "Sao chép"}
            </button>
          </div>
          <textarea
            value={mergedPrompt}
            readOnly
            rows={5}
            placeholder="Prompt ghép sẽ hiện tại đây khi bạn chọn yêu cầu..."
            className="min-h-28 w-full resize-y rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm leading-6 text-gray-700 outline-none"
          />
        </div>
      </div>
      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </article>
  );
}
