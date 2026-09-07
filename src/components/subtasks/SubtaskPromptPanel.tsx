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
} from "lucide-react";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { subtaskService } from "@/services/subtask-service";
import type { SubtaskPromptItem } from "@/types/subtask";

const MAX_PROMPT_ITEMS = 30;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type SaveStatus = "idle" | "saving" | "saved" | "error";

function emptyItem(id = crypto.randomUUID()): SubtaskPromptItem {
  return { id, content: "", status: "unprocessed" };
}

function combinedPrompt(item: SubtaskPromptItem): string {
  return [item.content.trim(), item.imageUrl].filter(Boolean).join("\n");
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
}

export function SubtaskPromptPanel({ subtaskId, initialItems }: SubtaskPromptPanelProps) {
  const { notify } = useFeedback();
  const initial = initialItems.length > 0 ? initialItems : [emptyItem(`prompt-empty-${subtaskId}`)];
  const [items, setItems] = useState<SubtaskPromptItem[]>(initial);
  const itemsRef = useRef(initial);
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveGenerationRef = useRef(0);
  const hasEditedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void subtaskService.getPromptItems(subtaskId).then((savedItems) => {
      if (!active || hasEditedRef.current || savedItems.length === 0) return;
      itemsRef.current = savedItems;
      setItems(savedItems);
    }).catch(() => {
      // Trang vẫn dùng được khi deployment chưa áp dụng migration Prompt.
    });
    return () => {
      active = false;
    };
  }, [subtaskId]);

  function replaceItems(next: SubtaskPromptItem[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function persist(next: SubtaskPromptItem[]) {
    const generation = ++saveGenerationRef.current;
    setSaveStatus("saving");
    const payload = next.filter((item) => item.content.trim() || item.imageUrl);
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

  async function uploadImage(itemId: string, file: File) {
    hasEditedRef.current = true;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      notify({ type: "error", title: "Ảnh không hợp lệ", description: "Chỉ hỗ trợ JPG, PNG, WEBP hoặc AVIF." });
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      notify({ type: "error", title: "Ảnh không hợp lệ", description: "Ảnh phải có dung lượng từ 1 byte đến 10 MB." });
      return;
    }

    setUploadingIds((current) => new Set(current).add(itemId));
    try {
      const imageUrl = await subtaskService.uploadImage(file);
      const next = itemsRef.current.map((item) => (item.id === itemId ? { ...item, imageUrl } : item));
      replaceItems(next);
      persist(next);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể tải ảnh lên Cloudinary",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setUploadingIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  async function handleCopy(item: SubtaskPromptItem) {
    const prompt = combinedPrompt(item);
    if (!prompt) return;
    try {
      await copyToClipboard(prompt);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1500);
      notify({ type: "success", title: "Đã sao chép Prompt" });
    } catch {
      notify({ type: "error", title: "Không thể sao chép", description: "Hãy chọn nội dung và sao chép thủ công." });
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="h-1 bg-sky-500" />
      <div className="p-4 @md/detail:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <MessageSquareText className="h-4 w-4 text-sky-600" />
              Prompt
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Nhập yêu cầu, dán ảnh bằng Ctrl+V và sao chép Prompt đã ghép với link Cloudinary.
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

        <div className="mt-5 space-y-4">
          {items.map((item, index) => {
            const prompt = combinedPrompt(item);
            const uploading = uploadingIds.has(item.id);
            return (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 @md/detail:p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-gray-700">Yêu cầu {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Xóa yêu cầu ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 @2xl/detail:grid-cols-[minmax(0,1fr)_220px_160px]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500">Nội dung yêu cầu</span>
                    <textarea
                      value={item.content}
                      onChange={(event) => updateItem(item.id, { content: event.target.value })}
                      onBlur={() => persist(itemsRef.current)}
                      maxLength={5000}
                      rows={5}
                      placeholder="Gõ nội dung yêu cầu..."
                      className="min-h-32 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-6 text-gray-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>

                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500">Ảnh tham chiếu</span>
                    <label
                      className={cn(
                        "flex min-h-32 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-white text-center outline-none transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100",
                        item.imageUrl ? "border-sky-200" : "border-gray-300 hover:border-sky-400 hover:bg-sky-50/40"
                      )}
                      tabIndex={0}
                      onPaste={(event) => {
                        const file = Array.from(event.clipboardData.items)
                          .find((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
                          ?.getAsFile();
                        if (!file) return;
                        event.preventDefault();
                        void uploadImage(item.id, file);
                      }}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="sr-only"
                        disabled={uploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadImage(item.id, file);
                          event.target.value = "";
                        }}
                      />
                      {uploading ? (
                        <>
                          <LoaderCircle className="h-6 w-6 animate-spin text-sky-600" />
                          <span className="mt-2 text-xs font-semibold text-sky-700">Đang tải lên Cloudinary...</span>
                        </>
                      ) : item.imageUrl ? (
                        <>
                          {/* URL Cloudinary động nên dùng img thay vì giới hạn hostname của next/image. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt={`Ảnh yêu cầu ${index + 1}`} className="h-24 w-full object-cover" />
                          <span className="w-full truncate px-2 py-1.5 text-[11px] text-sky-700">{item.imageUrl}</span>
                        </>
                      ) : (
                        <>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                            <ImagePlus className="h-5 w-5" />
                          </span>
                          <span className="mt-2 text-xs font-semibold text-gray-600">Nhấn để chọn ảnh</span>
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <ClipboardPaste className="h-3 w-3" /> Dán bằng Ctrl+V
                          </span>
                        </>
                      )}
                    </label>
                    {item.imageUrl && (
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, { imageUrl: undefined }, true)}
                        className="mt-1.5 text-xs font-medium text-rose-600 hover:underline"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-gray-500">Trạng thái</span>
                    <select
                      value={item.status}
                      onChange={(event) => updateItem(
                        item.id,
                        { status: event.target.value as SubtaskPromptItem["status"] },
                        true
                      )}
                      className={cn(
                        "h-10 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition focus:ring-2",
                        item.status === "processed"
                          ? "border-emerald-200 text-emerald-700 focus:border-emerald-400 focus:ring-emerald-100"
                          : "border-amber-200 text-amber-700 focus:border-amber-400 focus:ring-amber-100"
                      )}
                    >
                      <option value="unprocessed">Chưa xử lý</option>
                      <option value="processed">Đã xử lý</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-500">Prompt đã ghép</span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(item)}
                      disabled={!prompt}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copiedId === item.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === item.id ? "Đã sao chép" : "Sao chép"}
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    readOnly
                    rows={3}
                    placeholder="Prompt sẽ tự động xuất hiện tại đây..."
                    className="min-h-20 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-6 text-gray-700 outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
