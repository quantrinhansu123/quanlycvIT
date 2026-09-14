"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, ImagePlus, Paperclip, Plus, Trash2, X } from "lucide-react";
import type {
  ProgressReport,
  ProgressReportSubmission,
  WorkTask,
} from "@/types/task";
import {
  TASK_REPORT_IMAGE_MIME_TYPES,
  TASK_REPORT_MAX_FILE_SIZE,
} from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";

interface TaskReportDrawerProps {
  task: Pick<WorkTask, "id" | "title" | "progress" | "assigneeId">;
  initialProgress?: number;
  assignee?: ProjectMember;
  tester?: ProjectMember;
  testerOptions?: ProjectMember[];
  entityLabel?: string;
  submitReport: (input: ProgressReportSubmission) => Promise<ProgressReport>;
  onClose: () => void;
  onSubmitted?: (report: ProgressReport) => void;
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface PendingLink {
  id: string;
  label: string;
  url: string;
}

const MAX_REPORT_IMAGES = 10;
const MAX_REPORT_FILES = 10;
const MAX_REPORT_LINKS = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskReportDrawer({
  task,
  initialProgress,
  assignee,
  tester,
  testerOptions,
  entityLabel = "công việc",
  submitReport,
  onClose,
  onSubmitted,
}: TaskReportDrawerProps) {
  const { notify } = useFeedback();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState(initialProgress ?? task.progress);
  const [testerId, setTesterId] = useState(tester?.id ?? "");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    name: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    // Drawer có thể mở chồng lên modal, nên trả lại giá trị cũ thay vì xóa trắng.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (previewImage) {
        setPreviewImage(null);
      } else if (!submitting) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, previewImage, submitting]);

  // Giải phóng object URL của ảnh xem trước khi drawer đóng.
  const imagesRef = useRef<PendingImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    },
    []
  );

  const rejectFile = useCallback(
    (file: File, requireImage: boolean): string | null => {
      if (file.size > TASK_REPORT_MAX_FILE_SIZE) {
        return `File “${file.name}” vượt quá 10MB.`;
      }
      if (requireImage && !TASK_REPORT_IMAGE_MIME_TYPES.includes(file.type)) {
        return `“${file.name}” không phải ảnh PNG, JPG hoặc WEBP.`;
      }
      return null;
    },
    []
  );

  const addImages = useCallback(
    (incoming: File[]) => {
      const availableSlots = MAX_REPORT_IMAGES - images.length;
      if (availableSlots <= 0) {
        notify({
          type: "error",
          title: "Đã đủ số lượng ảnh",
          description: `Mỗi báo cáo chỉ được đính kèm tối đa ${MAX_REPORT_IMAGES} ảnh.`,
        });
        return;
      }

      const accepted: PendingImage[] = [];
      for (const file of incoming) {
        const problem = rejectFile(file, true);
        if (problem) {
          notify({ type: "error", title: "Không thể thêm ảnh", description: problem });
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      const selected = accepted.slice(0, availableSlots);
      for (const image of accepted.slice(availableSlots)) {
        URL.revokeObjectURL(image.previewUrl);
      }
      if (selected.length > 0) setImages((prev) => [...prev, ...selected]);
      if (accepted.length > availableSlots) {
        notify({
          type: "error",
          title: "Một số ảnh chưa được thêm",
          description: `Chỉ thêm ${availableSlots} ảnh để không vượt quá ${MAX_REPORT_IMAGES} ảnh.`,
        });
      }
    },
    [images.length, notify, rejectFile]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const availableSlots = MAX_REPORT_FILES - files.length;
      if (availableSlots <= 0) {
        notify({
          type: "error",
          title: "Đã đủ số lượng tệp",
          description: `Mỗi báo cáo chỉ được đính kèm tối đa ${MAX_REPORT_FILES} tệp.`,
        });
        return;
      }

      const accepted = incoming.filter((file) => {
        const problem = rejectFile(file, false);
        if (problem) {
          notify({ type: "error", title: "Không thể thêm file", description: problem });
          return false;
        }
        return true;
      });
      const selected = accepted.slice(0, availableSlots);
      if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
      if (accepted.length > availableSlots) {
        notify({
          type: "error",
          title: "Một số tệp chưa được thêm",
          description: `Chỉ thêm ${availableSlots} tệp để không vượt quá ${MAX_REPORT_FILES} tệp.`,
        });
      }
    },
    [files.length, notify, rejectFile]
  );

  // Dán ảnh trực tiếp bằng Ctrl+V.
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const pasted = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (pasted.length > 0) {
        event.preventDefault();
        addImages(pasted);
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addImages]);

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }

  function updateLink(id: string, patch: Partial<PendingLink>) {
    setLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, ...patch } : link))
    );
  }

  function addLink() {
    if (links.length >= MAX_REPORT_LINKS) return;
    setLinks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", url: "" },
    ]);
  }

  const trimmedLinks = useMemo(
    () =>
      links
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter((link) => link.url),
    [links]
  );

  const invalidLink = useMemo(
    () =>
      trimmedLinks.find((link) => !/^https?:\/\/.+/i.test(link.url)),
    [trimmedLinks]
  );

  const testerRequired = progress === 100 && Boolean(testerOptions);
  const canSubmit = Boolean(content.trim()) && !submitting && (!testerRequired || Boolean(testerId));

  async function handleSubmit() {
    if (!content.trim()) {
      notify({
        type: "error",
        title: "Thiếu nội dung báo cáo",
        description: "Vui lòng nhập nội dung báo cáo trước khi gửi.",
      });
      return;
    }
    if (invalidLink) {
      notify({
        type: "error",
        title: "Liên kết không hợp lệ",
        description: `“${invalidLink.url}” phải bắt đầu bằng http:// hoặc https://.`,
      });
      return;
    }
    if (testerRequired && !testerId) {
      notify({
        type: "error",
        title: "Chưa chọn người test",
        description: "Vui lòng chọn người test trước khi gửi tiến độ 100%.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const submission: ProgressReportSubmission = {
        authorId: assignee?.id || task.assigneeId || undefined,
        content: content.trim(),
        progress,
        images: images.map((image) => image.file),
        files,
        links: trimmedLinks.map((link) => ({
          label: link.label || undefined,
          url: link.url,
        })),
        testerId: progress === 100 ? testerId || undefined : undefined,
      };
      const report = await submitReport(submission);
      notify({
        type: "success",
        title: "Đã gửi báo cáo tiến độ",
        description: `Tiến độ ${entityLabel} được cập nhật thành ${progress}%.`,
      });
      onSubmitted?.(report);
      onClose();
    } catch (submitError) {
      notify({
        type: "error",
        title: "Gửi báo cáo thất bại",
        description: getErrorMessage(
          submitError,
          "Không thể lưu báo cáo. Vui lòng thử lại."
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="account-overlay fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) onClose();
        }}
      >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Báo cáo tiến độ ${entityLabel}`}
        className="account-dialog flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <span className="h-2 w-2 rounded-full bg-brand-600" />
              Báo cáo tiến độ {entityLabel}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {entityLabel === "task" ? "Task" : "Công việc"}:{" "}
              <span className="font-semibold text-gray-700">{task.title}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="report-progress" className="text-sm font-semibold text-gray-700">
                Cập nhật tiến độ thực tế
              </label>
              <span className="text-base font-bold text-brand-600">{progress}%</span>
            </div>
            <input
              id="report-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-600"
              style={{
                background: `linear-gradient(to right, #d1122a ${progress}%, #e5e7eb ${progress}%)`,
              }}
            />
            <div className="mt-2 flex justify-between text-xs text-gray-400">
              <span>0% (Chưa bắt đầu)</span>
              <span>50%</span>
              <span>100% (Hoàn thành)</span>
            </div>
          </div>

          {testerRequired && (
            <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                Người test <span className="text-rose-500">*</span>
              </label>
              <SingleSelectDropdown
                options={(testerOptions ?? []).map((member) => ({
                  value: member.id,
                  label: member.name,
                  sublabel: member.role,
                }))}
                value={testerId}
                onChange={setTesterId}
                placeholder="Chọn người test..."
                searchable
                searchPlaceholder="Tìm người test..."
                invalid={!testerId}
              />
              <p className="mt-2 text-xs text-violet-700">
                Báo cáo 100% sẽ chuyển Task sang Chờ test.
              </p>
            </div>
          )}

          <div className="mt-5">
            <label htmlFor="report-content" className="text-sm font-semibold text-gray-700">
              Nội dung báo cáo <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="report-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              placeholder="Nhập chi tiết tiến trình công việc, kết quả đạt được, khó khăn (nếu có)..."
              className="mt-2 w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              addImages(
                Array.from(event.dataTransfer.files).filter((file) =>
                  file.type.startsWith("image/")
                )
              );
            }}
            className={cn(
              "mt-5 space-y-3 rounded-xl border p-3 transition-colors",
              dragActive
                ? "border-brand-400 bg-brand-50/60"
                : "border-transparent bg-gray-50/70"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold text-gray-700">
                Đính kèm báo cáo
              </span>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={submitting || images.length >= MAX_REPORT_IMAGES}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  images.length > 0
                    ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
                )}
                title={`Tối đa ${MAX_REPORT_IMAGES} ảnh, mỗi ảnh không quá 10 MB. Có thể kéo thả hoặc dán ảnh bằng Ctrl+V.`}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Chọn ảnh
                <span className={cn("text-[10px]", images.length > 0 ? "text-brand-400" : "text-gray-400")}>
                  {images.length}/{MAX_REPORT_IMAGES}
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || files.length >= MAX_REPORT_FILES}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  files.length > 0
                    ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
                )}
                title={`Tối đa ${MAX_REPORT_FILES} tệp, mỗi tệp không quá 10 MB`}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Chọn tệp
                <span className={cn("text-[10px]", files.length > 0 ? "text-brand-400" : "text-gray-400")}>
                  {files.length}/{MAX_REPORT_FILES}
                </span>
              </button>
              <button
                type="button"
                onClick={addLink}
                disabled={submitting || links.length >= MAX_REPORT_LINKS}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  links.length > 0
                    ? "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
                )}
                title={`Tối đa ${MAX_REPORT_LINKS} liên kết`}
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm liên kết
                <span className={cn("text-[10px]", links.length > 0 ? "text-brand-400" : "text-gray-400")}>
                  {links.length}/{MAX_REPORT_LINKS}
                </span>
              </button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept={TASK_REPORT_IMAGE_MIME_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={(event) => {
                addImages(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-brand-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      disabled={submitting}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Bỏ tệp ${file.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {links.length > 0 && (
              <div className="space-y-2">
                {links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(event) => updateLink(link.id, { label: event.target.value })}
                      placeholder="Tên đường dẫn"
                      className="h-9 w-[38%] rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(event) => updateLink(link.id, { url: event.target.value })}
                      placeholder="https://..."
                      className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => prev.filter((item) => item.id !== link.id))}
                      disabled={submitting}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Xóa liên kết"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {images.length > 0 && (
              <ul className="flex max-w-full flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden pb-2">
                {images.map((image) => (
                  <li
                    key={image.id}
                    className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-brand-200 bg-brand-50"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ name: image.file.name, url: image.previewUrl })}
                      className="h-full w-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                      aria-label={`Xem trước ảnh ${image.file.name}`}
                    >
                      {/* Ảnh dùng object URL cục bộ nên không qua bộ tối ưu ảnh của Next.js. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.previewUrl}
                        alt={image.file.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
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

            <p className="text-xs text-gray-400">
              Có thể kéo thả hoặc dán ảnh bằng Ctrl+V. Mỗi ảnh/tệp tối đa 10 MB.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? "Đang gửi..."
              : progress === 100 && testerOptions
                ? `Gửi cho Tester${testerId ? ` ${testerOptions.find((item) => item.id === testerId)?.name ?? ""}` : ""}`
                : "Gửi báo cáo"}
          </Button>
        </div>
      </div>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewImage(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Xem trước ảnh ${previewImage.name}`}
            className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-950/75 text-white transition hover:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950 sm:right-4 sm:top-4 sm:h-11 sm:w-11"
              aria-label="Đóng xem trước ảnh"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[90vh] max-w-[95vw] object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
