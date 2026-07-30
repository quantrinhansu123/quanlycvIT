"use client";

import { useRef, useState } from "react";
import { FileText, ImagePlus, Paperclip, Plus, Trash2 } from "lucide-react";
import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";
import { cn } from "@/lib/utils";
import {
  ImagePreviewDialog,
  type PreviewImage,
} from "@/components/ui/ImagePreviewDialog";

interface PendingAttachmentFile {
  id: string;
  file: File;
}

interface PendingAttachmentImage extends PendingAttachmentFile {
  previewUrl: string;
}

interface TaskAttachmentFieldsProps {
  label: string;
  entityLabel: string;
  files: TaskFileAttachment[];
  pendingFiles: PendingAttachmentFile[];
  links: TaskLinkAttachment[];
  images: string[];
  pendingImages: PendingAttachmentImage[];
  maxFiles: number;
  maxLinks: number;
  maxImages: number;
  submitting: boolean;
  fileError?: string;
  linkError?: string;
  imageError?: string;
  onSelectFiles: (files: FileList | null) => void;
  onSelectImages: (files: FileList | null) => void;
  onAddLink: () => void;
  onUpdateLink: (index: number, patch: Partial<TaskLinkAttachment>) => void;
  onRemoveLink: (index: number) => void;
  onRemoveSavedFile: (url: string) => void;
  onRemovePendingFile: (id: string) => void;
  onRemoveSavedImage: (url: string) => void;
  onRemovePendingImage: (id: string) => void;
}

export function TaskAttachmentFields({
  label,
  entityLabel,
  files,
  pendingFiles,
  links,
  images,
  pendingImages,
  maxFiles,
  maxLinks,
  maxImages,
  submitting,
  fileError,
  linkError,
  imageError,
  onSelectFiles,
  onSelectImages,
  onAddLink,
  onUpdateLink,
  onRemoveLink,
  onRemoveSavedFile,
  onRemovePendingFile,
  onRemoveSavedImage,
  onRemovePendingImage,
}: TaskAttachmentFieldsProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const imageCount = images.length + pendingImages.length;
  const fileCount = files.length + pendingFiles.length;

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={submitting || imageCount >= maxImages}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            imageCount > 0
              ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
              : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
          )}
          title={`Tối đa ${maxImages} ảnh, mỗi ảnh không quá 10 MB`}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Chọn ảnh
          <span className={cn("text-[10px]", imageCount > 0 ? "text-brand-400" : "text-gray-400")}>
            {imageCount}/{maxImages}
          </span>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting || fileCount >= maxFiles}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            fileCount > 0
              ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
              : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
          )}
          title={`Tối đa ${maxFiles} tệp, mỗi tệp không quá 20 MB`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Chọn tệp
          <span className={cn("text-[10px]", fileCount > 0 ? "text-brand-400" : "text-gray-400")}>
            {fileCount}/{maxFiles}
          </span>
        </button>
        <button
          type="button"
          onClick={onAddLink}
          disabled={submitting || links.length >= maxLinks}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            links.length > 0
              ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
              : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
          )}
          title={`Tối đa ${maxLinks} liên kết`}
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm liên kết
          <span className={cn("text-[10px]", links.length > 0 ? "text-brand-400" : "text-gray-400")}>
            {links.length}/{maxLinks}
          </span>
        </button>
        </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(event) => {
          onSelectImages(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          onSelectFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {(files.length > 0 || pendingFiles.length > 0) && (
        <ul className="space-y-2">
          {files.map((fileItem) => (
            <li
              key={fileItem.url}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
              <a
                href={fileItem.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-brand-600"
              >
                {fileItem.name}
              </a>
              <button
                type="button"
                onClick={() => onRemoveSavedFile(fileItem.url)}
                disabled={submitting}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Xóa tệp ${fileItem.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {pendingFiles.map((pending) => (
            <li
              key={pending.id}
              className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-brand-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                {pending.file.name}
              </span>
              <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                Chưa lưu
              </span>
              <button
                type="button"
                onClick={() => onRemovePendingFile(pending.id)}
                disabled={submitting}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Bỏ tệp ${pending.file.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((link, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={link.label ?? ""}
                  onChange={(event) => onUpdateLink(index, { label: event.target.value })}
                  placeholder="Tên đường dẫn"
                  className="h-9 w-[38%] rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(event) => onUpdateLink(index, { url: event.target.value })}
                  placeholder="https://..."
                  className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => onRemoveLink(index)}
                  disabled={submitting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Xóa liên kết"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={link.description ?? ""}
                onChange={(event) => onUpdateLink(index, { description: event.target.value })}
                placeholder="Mô tả đường dẫn (không bắt buộc)"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          ))}
        </div>
      )}

        {(images.length > 0 || pendingImages.length > 0) && (
          <ul className="flex max-w-full flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden pb-1">
            {images.map((url, index) => (
              <li
                key={url}
                className="group relative w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPreviewImage({
                      name: `Ảnh ${entityLabel} ${index + 1}`,
                      url,
                    })
                  }
                  className="block h-16 w-24 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                  aria-label={`Xem trước ảnh ${entityLabel} ${index + 1}`}
                >
                  {/* URL Cloudinary động nên dùng img thay vì giới hạn hostname của next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Ảnh ${entityLabel} ${index + 1}`}
                    className="h-16 w-24 object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSavedImage(url)}
                  disabled={submitting}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-gray-950/70 text-white shadow-sm transition hover:bg-rose-600"
                  aria-label={`Xóa ảnh ${entityLabel} ${index + 1}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
            {pendingImages.map((image) => (
              <li
                key={image.id}
                className="group relative w-24 shrink-0 overflow-hidden rounded-lg border border-brand-200 bg-brand-50"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPreviewImage({
                      name: image.file.name,
                      url: image.previewUrl,
                    })
                  }
                  className="block h-16 w-24 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                  aria-label={`Xem trước ảnh ${image.file.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    className="h-16 w-24 object-cover"
                  />
                </button>
                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-brand-600 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                  Chưa lưu
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePendingImage(image.id)}
                  disabled={submitting}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-gray-950/70 text-white shadow-sm transition hover:bg-rose-600"
                  aria-label={`Bỏ ảnh ${image.file.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {imageError && <p role="alert" className="text-xs text-rose-600">{imageError}</p>}
        {fileError && <p role="alert" className="text-xs text-rose-600">{fileError}</p>}
        {linkError && <p className="text-xs text-rose-500">{linkError}</p>}
      </div>

      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
}
