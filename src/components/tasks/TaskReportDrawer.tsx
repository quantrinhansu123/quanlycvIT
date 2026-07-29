"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Link2, Paperclip, Plus, X } from "lucide-react";
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

interface TaskReportDrawerProps {
  task: Pick<WorkTask, "id" | "title" | "progress" | "assigneeId">;
  assignee?: ProjectMember;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskReportDrawer({
  task,
  assignee,
  entityLabel = "công việc",
  submitReport,
  onClose,
  onSubmitted,
}: TaskReportDrawerProps) {
  const { notify } = useFeedback();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState(task.progress);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

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
      if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
    },
    [notify, rejectFile]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const accepted = incoming.filter((file) => {
        const problem = rejectFile(file, false);
        if (problem) {
          notify({ type: "error", title: "Không thể thêm file", description: problem });
          return false;
        }
        return true;
      });
      if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    },
    [notify, rejectFile]
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

  const canSubmit = Boolean(content.trim()) && !submitting;

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
              <span className="h-2 w-2 rounded-full bg-blue-600" />
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
              <span className="text-base font-bold text-blue-600">{progress}%</span>
            </div>
            <input
              id="report-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
              style={{
                background: `linear-gradient(to right, #2563eb ${progress}%, #e5e7eb ${progress}%)`,
              }}
            />
            <div className="mt-2 flex justify-between text-xs text-gray-400">
              <span>0% (Chưa bắt đầu)</span>
              <span>50%</span>
              <span>100% (Hoàn thành)</span>
            </div>
          </div>

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
              className="mt-2 w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="mt-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <ImageIcon className="h-4 w-4 text-gray-400" />
              Hình ảnh tiến độ
            </p>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                addImages(Array.from(event.dataTransfer.files));
              }}
              className={cn(
                "mt-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
                dragActive ? "border-blue-400 bg-blue-50/60" : "border-gray-200"
              )}
            >
              <ImageIcon className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                Kéo thả, dán (Ctrl+V) hoặc{" "}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="font-semibold text-blue-600 underline hover:text-blue-700"
                >
                  chọn file
                </button>
              </p>
              <p className="mt-1 text-xs text-gray-400">PNG, JPG, WEBP (tối đa 10MB)</p>
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
            </div>

            {images.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-3">
                {images.map((image) => (
                  <li key={image.id} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Xóa ảnh ${image.file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <Paperclip className="h-4 w-4 text-gray-400" />
              File tài liệu đính kèm
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex h-14 w-full items-center gap-2.5 rounded-xl border border-dashed border-gray-200 px-4 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50/40"
            >
              <Paperclip className="h-4 w-4 text-gray-400" />
              Chọn file
            </button>
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
            <p className="mt-1.5 text-xs text-gray-400">
              Ảnh, audio, video, PDF, ZIP/RAR... (tối đa 10MB)
            </p>

            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <span className="truncate text-sm text-gray-700">{file.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="text-gray-400 hover:text-rose-500"
                        aria-label={`Xóa file ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Link2 className="h-4 w-4 text-gray-400" />
                Liên kết ngoài (Figma, Github, Google Doc...)
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLinks((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), label: "", url: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm link
              </Button>
            </div>

            {links.length > 0 && (
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(event) =>
                        updateLink(link.id, { label: event.target.value })
                      }
                      placeholder="Tên hiển thị"
                      className="h-10 w-36 shrink-0 rounded-lg border border-gray-200 px-3 text-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(event) =>
                        updateLink(link.id, { url: event.target.value })
                      }
                      placeholder="https://..."
                      className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLinks((prev) => prev.filter((item) => item.id !== link.id))
                      }
                      className="shrink-0 text-gray-400 hover:text-rose-500"
                      aria-label="Xóa liên kết"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Đang gửi..." : "Gửi báo cáo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
