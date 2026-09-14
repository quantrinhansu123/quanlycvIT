"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { TaskAttachmentFields } from "@/components/tasks/TaskAttachmentFields";
import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";
import { runUploadBatch } from "@/lib/upload-concurrency";

interface PendingFile {
  id: string;
  file: File;
  description?: string;
}

interface PendingImage extends PendingFile {
  previewUrl: string;
}

interface AttachmentValue {
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
}

interface InlineTaskAttachmentEditorProps extends AttachmentValue {
  entityLabel: string;
  onUploadFile: (file: File) => Promise<TaskFileAttachment>;
  onUploadImage: (file: File) => Promise<string>;
  onSave: (value: AttachmentValue) => Promise<void>;
}

const MAX_ITEMS = 10;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeLinks(links: TaskLinkAttachment[]): TaskLinkAttachment[] {
  return links
    .map((link) => ({
      label: link.label?.trim() || undefined,
      url: link.url.trim(),
      description: link.description?.trim() || undefined,
    }))
    .filter((link) => link.url);
}

export function InlineTaskAttachmentEditor({
  entityLabel,
  files,
  links,
  images,
  onUploadFile,
  onUploadImage,
  onSave,
}: InlineTaskAttachmentEditorProps) {
  const [draftFiles, setDraftFiles] = useState<TaskFileAttachment[]>(files);
  const [draftLinks, setDraftLinks] = useState<TaskLinkAttachment[]>(links);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [filesDirty, setFilesDirty] = useState(false);
  const [linksDirty, setLinksDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileError, setFileError] = useState("");
  const [imageError, setImageError] = useState("");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const showSaved = useCallback(() => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1800);
  }, []);

  const persist = useCallback(async (value: AttachmentValue) => {
    setSaving(true);
    try {
      await onSave(value);
      setDraftFiles(value.files);
      setDraftLinks(value.links);
      showSaved();
    } finally {
      setSaving(false);
    }
  }, [onSave, showSaved]);

  const hasIncompleteLink = draftLinks.some(
    (link) => !link.url.trim() && Boolean(link.label?.trim() || link.description?.trim())
  );
  const invalidLink = normalizeLinks(draftLinks).find((link) => !isValidHttpUrl(link.url));
  const linkError = linksDirty
    ? hasIncompleteLink
      ? "Vui lòng nhập đường dẫn liên kết."
      : invalidLink
        ? "Liên kết phải bắt đầu bằng http:// hoặc https://."
        : ""
    : "";

  useEffect(() => {
    if ((!linksDirty && !filesDirty) || saving) return;
    const normalized = normalizeLinks(draftLinks);
    if (hasIncompleteLink || invalidLink) {
      return;
    }
    const timer = setTimeout(() => {
      void persist({ files: draftFiles, links: normalized, images })
        .then(() => {
          setFilesDirty(false);
          setLinksDirty(false);
        })
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [draftFiles, draftLinks, filesDirty, hasIncompleteLink, images, invalidLink, linksDirty, persist, saving]);

  async function selectImages(fileList: FileList | File[] | null) {
    if (!fileList?.length || saving) return;
    const available = MAX_ITEMS - images.length;
    if (available <= 0) return setImageError(`Mỗi ${entityLabel} chỉ được lưu tối đa ${MAX_ITEMS} ảnh.`);
    const selected = Array.from(fileList).slice(0, available);
    const invalid = selected.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
    if (invalid) return setImageError("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF.");
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_IMAGE_SIZE);
    if (oversized) return setImageError(`Ảnh “${oversized.name}” phải có dung lượng tối đa 10 MB.`);

    const pending = selected.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingImages(pending);
    setImageError(selected.length < fileList.length ? `Chỉ thêm ${available} ảnh để không vượt quá ${MAX_ITEMS} ảnh.` : "");
    setSaving(true);
    const uploaded: string[] = [];
    try {
      const result = await runUploadBatch(pending.map((item) => ({
        id: item.id,
        upload: async () => { uploaded.push(await onUploadImage(item.file)); },
      })));
      if (uploaded.length) await onSave({ files: draftFiles, links, images: [...images, ...uploaded] });
      if (result.failures.length) setImageError(`${result.failures.length} ảnh tải lên thất bại. Vui lòng chọn lại.`);
      else showSaved();
    } catch {
      setImageError("Không thể cập nhật ảnh. Vui lòng thử lại.");
    } finally {
      pending.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setPendingImages([]);
      setSaving(false);
    }
  }

  async function selectFiles(fileList: FileList | null) {
    if (!fileList?.length || saving) return;
    const available = MAX_ITEMS - draftFiles.length;
    if (available <= 0) return setFileError(`Mỗi ${entityLabel} chỉ được đính kèm tối đa ${MAX_ITEMS} tệp.`);
    const selected = Array.from(fileList).slice(0, available);
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_FILE_SIZE);
    if (oversized) return setFileError(`Tệp “${oversized.name}” phải có dung lượng tối đa 20 MB.`);

    const pending = selected.map((file) => ({ id: crypto.randomUUID(), file }));
    setPendingFiles(pending);
    setFileError(selected.length < fileList.length ? `Chỉ thêm ${available} tệp để không vượt quá ${MAX_ITEMS} tệp.` : "");
    setSaving(true);
    const uploaded: TaskFileAttachment[] = [];
    try {
      const result = await runUploadBatch(pending.map((item) => ({
        id: item.id,
        upload: async () => { uploaded.push(await onUploadFile(item.file)); },
      })));
      if (uploaded.length) {
        const nextFiles = [...draftFiles, ...uploaded];
        await onSave({ files: nextFiles, links, images });
        setDraftFiles(nextFiles);
      }
      if (result.failures.length) setFileError(`${result.failures.length} tệp tải lên thất bại. Vui lòng chọn lại.`);
      else showSaved();
    } catch {
      setFileError("Không thể cập nhật tệp đính kèm. Vui lòng thử lại.");
    } finally {
      setPendingFiles([]);
      setSaving(false);
    }
  }

  async function removeFile(url: string) {
    if (saving) return;
    const next = draftFiles.filter((file) => file.url !== url);
    setDraftFiles(next);
    setFilesDirty(false);
    await persist({ files: next, links, images }).catch(() => undefined);
  }

  function updateFile(url: string, patch: Partial<TaskFileAttachment>) {
    setDraftFiles((current) => current.map((file) => file.url === url ? { ...file, ...patch } : file));
    setFilesDirty(true);
  }

  async function removeImage(url: string) {
    if (saving) return;
    await persist({ files: draftFiles, links, images: images.filter((image) => image !== url) }).catch(() => undefined);
  }

  function addLink() {
    if (draftLinks.length >= MAX_ITEMS) return;
    setDraftLinks((current) => [...current, { label: "", url: "", description: "" }]);
  }

  function updateLink(index: number, patch: Partial<TaskLinkAttachment>) {
    setDraftLinks((current) => current.map((link, itemIndex) => itemIndex === index ? { ...link, ...patch } : link));
    setLinksDirty(true);
  }

  function removeLink(index: number) {
    const next = draftLinks.filter((_, itemIndex) => itemIndex !== index);
    setDraftLinks(next);
    setLinksDirty(false);
    void persist({ files: draftFiles, links: normalizeLinks(next), images }).catch(() => undefined);
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-2 flex min-h-5 items-center justify-end text-[11px] font-medium">
        {saving ? (
          <span className="flex items-center gap-1.5 text-brand-600"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Đang tự động lưu...</span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Đã tự động lưu</span>
        ) : null}
      </div>
      <TaskAttachmentFields
        label={`Tài liệu ${entityLabel}`}
        entityLabel={entityLabel}
        files={draftFiles}
        pendingFiles={pendingFiles}
        links={draftLinks}
        images={images}
        pendingImages={pendingImages}
        maxFiles={MAX_ITEMS}
        maxLinks={MAX_ITEMS}
        maxImages={MAX_ITEMS}
        submitting={saving || filesDirty || linksDirty}
        fileError={fileError}
        imageError={imageError}
        linkError={linkError}
        onSelectFiles={(value) => void selectFiles(value)}
        onSelectImages={(value) => void selectImages(value)}
        onAddLink={addLink}
        onUpdateLink={updateLink}
        onRemoveLink={removeLink}
        onRemoveSavedFile={(url) => void removeFile(url)}
        onRemovePendingFile={() => undefined}
        onUpdateSavedFile={updateFile}
        onRemoveSavedImage={(url) => void removeImage(url)}
        onRemovePendingImage={() => undefined}
      />
    </div>
  );
}
