"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  ImagePlus,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Subtask,
  SubtaskInput,
  TaskFileAttachment,
  TaskLinkAttachment,
} from "@/types/subtask";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, type WorkTask } from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { subtaskService } from "@/services/subtask-service";
import { toDateInputValue, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

interface SubtaskFormModalProps {
  mode: "create" | "edit";
  subtask?: Subtask;
  workTasks: WorkTask[];
  members: ProjectMember[];
  defaultWorkTaskId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  workTaskId: string;
  assigneeIds: string[];
  status: SubtaskInput["status"];
  priority: SubtaskInput["priority"];
  startDate: string;
  dueDate: string;
  progress: number;
  tagsText: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
}

interface PendingTaskImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface PendingTaskFile {
  id: string;
  file: File;
}

const MAX_TASK_IMAGES = 10;
const MAX_TASK_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TASK_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const MAX_TASK_FILES = 10;
const MAX_TASK_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TASK_LINKS = 10;

/** Chiều cao tối đa của ô mô tả trước khi hiện thanh cuộn thay vì phình to thêm. */
const DESCRIPTION_MAX_HEIGHT = 200;

function resizeDescriptionTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, DESCRIPTION_MAX_HEIGHT)}px`;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function buildInitialState(
  subtask: Subtask | undefined,
  workTasks: WorkTask[],
  defaultWorkTaskId?: string
): FormState {
  if (subtask) {
    return {
      title: subtask.title,
      description: subtask.description ?? "",
      workTaskId: subtask.workTaskId,
      assigneeIds: subtask.assignees.map((member) => member.id),
      status: subtask.status,
      priority: subtask.priority,
      startDate: toDateInputValue(subtask.startDate),
      dueDate: toDateInputValue(subtask.dueDate),
      progress: subtask.progress,
      tagsText: subtask.tags.join(", "),
      files: subtask.files,
      links: subtask.links,
      images: subtask.images,
    };
  }
  return {
    title: "",
    description: "",
    workTaskId: defaultWorkTaskId ?? workTasks[0]?.id ?? "",
    assigneeIds: [],
    status: "todo",
    priority: "low",
    startDate: toDateInputValue(new Date().toISOString()),
    dueDate: "",
    progress: 0,
    tagsText: "",
    files: [],
    links: [],
    images: [],
  };
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function WorkTaskSelect({
  options,
  value,
  onChange,
  invalid,
}: {
  options: WorkTask[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.id === value);
  const expanded = open && options.length > 0;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filtered = useMemo(() => {
    const keyword = normalizeSearchValue(search);
    if (!keyword) return options;
    return options.filter((option) =>
      normalizeSearchValue(option.title).includes(keyword)
    );
  }, [options, search]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-shadow",
          options.length === 0 && "bg-gray-50",
          invalid
            ? "border-rose-400"
            : expanded
              ? "border-blue-400 ring-2 ring-blue-100"
              : "border-gray-200"
        )}
      >
        {selected && (
          <span
            className="flex min-w-0 max-w-[70%] items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            title={selected.title}
          >
            <span className="truncate">{selected.title}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          disabled={options.length === 0}
          className="flex min-h-7 min-w-[150px] flex-1 items-center justify-between gap-2 px-1.5 text-left text-sm text-gray-500 disabled:cursor-not-allowed"
          aria-expanded={expanded}
          aria-haspopup="listbox"
        >
          <span className="truncate">
            {options.length === 0
              ? "Chưa có công việc để chọn"
              : selected
                ? "Đổi công việc..."
                : "Chọn công việc..."}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="relative border-b border-gray-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên công việc..."
              autoFocus
              className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5" role="listbox">
            {filtered.map((option) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(option.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                    isSelected && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                    {option.title}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                Không tìm thấy công việc phù hợp
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubtaskFormModal({
  mode,
  subtask,
  workTasks,
  members,
  defaultWorkTaskId,
  onClose,
  onSaved,
}: SubtaskFormModalProps) {
  const { notify } = useFeedback();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(subtask, workTasks, defaultWorkTaskId)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingTaskImage[]>([]);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<PendingTaskImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingTaskFile[]>([]);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    resizeDescriptionTextarea(descriptionRef.current);
  }, []);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(
    () => () => {
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    },
    []
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  const workTaskAssignees = useMemo(
    () => workTasks.find((item) => item.id === form.workTaskId)?.assignees ?? [],
    [workTasks, form.workTaskId]
  );

  /** Đổi công việc thì bỏ những người không phụ trách công việc mới. */
  function handleWorkTaskChange(workTaskId: string) {
    const allowed = new Set(
      (workTasks.find((item) => item.id === workTaskId)?.assignees ?? []).map(
        (member) => member.id
      )
    );
    setForm((prev) => ({
      ...prev,
      workTaskId,
      assigneeIds: prev.assigneeIds.filter((id) => allowed.has(id)),
    }));
    setErrors((prev) => ({ ...prev, workTaskId: undefined }));
  }

  function handleImageSelection(files: FileList | null) {
    if (!files?.length) return;

    const availableSlots =
      MAX_TASK_IMAGES - form.images.length - pendingImages.length;
    if (availableSlots <= 0) {
      setImageError(`Mỗi Task chỉ được lưu tối đa ${MAX_TASK_IMAGES} ảnh.`);
      return;
    }

    const selected = Array.from(files);
    const invalidType = selected.find(
      (file) => !ALLOWED_TASK_IMAGE_TYPES.has(file.type)
    );
    if (invalidType) {
      setImageError("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF.");
      return;
    }

    const oversized = selected.find(
      (file) => file.size === 0 || file.size > MAX_TASK_IMAGE_SIZE
    );
    if (oversized) {
      setImageError(`Ảnh “${oversized.name}” phải có dung lượng tối đa 10 MB.`);
      return;
    }

    const nextImages = selected.slice(0, availableSlots).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingImages((current) => [...current, ...nextImages]);
    setImageError(
      selected.length > availableSlots
        ? `Chỉ thêm ${availableSlots} ảnh để không vượt quá ${MAX_TASK_IMAGES} ảnh.`
        : ""
    );
  }

  function removePendingImage(id: string) {
    setPendingImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
    setImageError("");
  }

  function removeSavedImage(url: string) {
    setForm((current) => ({
      ...current,
      images: current.images.filter((image) => image !== url),
    }));
    setImageError("");
  }

  function handleFileSelection(fileList: FileList | null) {
    if (!fileList?.length) return;

    const availableSlots = MAX_TASK_FILES - form.files.length - pendingFiles.length;
    if (availableSlots <= 0) {
      setFileError(`Mỗi Task chỉ được đính kèm tối đa ${MAX_TASK_FILES} tệp.`);
      return;
    }

    const selected = Array.from(fileList);
    const oversized = selected.find(
      (file) => file.size === 0 || file.size > MAX_TASK_FILE_SIZE
    );
    if (oversized) {
      setFileError(`Tệp “${oversized.name}” phải có dung lượng tối đa 20 MB.`);
      return;
    }

    const nextFiles = selected.slice(0, availableSlots).map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));
    setPendingFiles((current) => [...current, ...nextFiles]);
    setFileError(
      selected.length > availableSlots
        ? `Chỉ thêm ${availableSlots} tệp để không vượt quá ${MAX_TASK_FILES} tệp.`
        : ""
    );
  }

  function removePendingFile(id: string) {
    setPendingFiles((current) => current.filter((item) => item.id !== id));
    setFileError("");
  }

  function removeSavedFile(url: string) {
    setForm((current) => ({
      ...current,
      files: current.files.filter((file) => file.url !== url),
    }));
    setFileError("");
  }

  function addLinkRow() {
    setForm((prev) => ({ ...prev, links: [...prev.links, { label: "", url: "" }] }));
    setErrors((prev) => ({ ...prev, links: undefined }));
  }

  function updateLinkRow(index: number, patch: Partial<TaskLinkAttachment>) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }));
    setErrors((prev) => ({ ...prev, links: undefined }));
  }

  function removeLinkRow(index: number) {
    setForm((prev) => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }));
  }

  /** Bỏ qua các dòng liên kết chưa nhập gì thay vì bắt lỗi. */
  function normalizedLinks(): TaskLinkAttachment[] {
    return form.links
      .map((link) => ({ label: link.label?.trim() || undefined, url: link.url.trim() }))
      .filter((link) => link.url);
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) nextErrors.title = "Vui lòng nhập tên task";
    if (!form.workTaskId) nextErrors.workTaskId = "Vui lòng chọn công việc";
    if (form.assigneeIds.length === 0) {
      nextErrors.assigneeIds = workTaskAssignees.length === 0
        ? "Công việc chưa có người phụ trách. Hãy cập nhật công việc trước."
        : "Vui lòng chọn ít nhất một người thực hiện";
    }
    if (!form.startDate) nextErrors.startDate = "Vui lòng chọn ngày bắt đầu";
    if (!form.dueDate) nextErrors.dueDate = "Vui lòng chọn ngày hoàn thành";
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      nextErrors.dueDate = "Ngày hoàn thành phải sau ngày bắt đầu";
    }
    const invalidLink = normalizedLinks().find((link) => !isValidHttpUrl(link.url));
    if (invalidLink) {
      nextErrors.links = `Liên kết “${invalidLink.url}” không hợp lệ.`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const [uploadedImages, uploadedFiles] = await Promise.all([
        Promise.all(pendingImages.map((image) => subtaskService.uploadImage(image.file))),
        Promise.all(pendingFiles.map((pending) => subtaskService.uploadFile(pending.file))),
      ]);
      const input: SubtaskInput = {
        title: form.title.trim(),
        description: form.description || undefined,
        workTaskId: form.workTaskId,
        assigneeIds: form.assigneeIds,
        status: form.status,
        priority: form.priority,
        startDate: form.startDate,
        dueDate: form.dueDate,
        progress: Math.min(100, Math.max(0, Number(form.progress) || 0)),
        tags: form.tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        files: [...form.files, ...uploadedFiles],
        links: normalizedLinks(),
        images: [...form.images, ...uploadedImages],
      };
      if (mode === "edit" && subtask) {
        await subtaskService.updateSubtask(subtask.id, input);
      } else {
        await subtaskService.createSubtask(input);
      }
      notify({
        type: "success",
        title: mode === "edit" ? "Đã cập nhật task" : "Đã tạo task",
        description: `Task “${input.title}” đã được lưu thành công.`,
      });
      onSaved();
    } catch (error) {
      const message = getErrorMessage(error, "Không thể lưu task. Vui lòng thử lại.");
      setSubmitError(message);
      notify({ type: "error", title: "Lưu task thất bại", description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtask-form-title"
        className="account-dialog flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 id="subtask-form-title" className="text-lg font-bold text-gray-900">
            {mode === "edit" ? "Chỉnh sửa task" : "Thêm task mới"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {(workTasks.length === 0 || members.length === 0) && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {workTasks.length === 0
                ? "Chưa có công việc. Hãy tạo công việc trước khi tạo task."
                : "Chưa có nhân sự đang hoạt động trong Supabase để giao task."}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Tên task <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="VD: Bấm đầu dây tầng 1, thiết kế màn hình đăng nhập..."
              className={cn(
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                errors.title ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
              )}
            />
            {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Mô tả task</label>
            <textarea
              ref={descriptionRef}
              value={form.description}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, description: event.target.value }));
                resizeDescriptionTextarea(event.target);
              }}
              placeholder="Chi tiết yêu cầu task..."
              rows={3}
              style={{ maxHeight: DESCRIPTION_MAX_HEIGHT }}
              className="w-full resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-medium text-gray-700">Đính kèm Task</span>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={
                  submitting ||
                  form.images.length + pendingImages.length >= MAX_TASK_IMAGES
                }
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  form.images.length + pendingImages.length > 0
                    ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                )}
                title={`Tối đa ${MAX_TASK_IMAGES} ảnh, mỗi ảnh không quá 10 MB`}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Chọn ảnh
                <span
                  className={cn(
                    "text-[10px]",
                    form.images.length + pendingImages.length > 0
                      ? "text-blue-400"
                      : "text-gray-400"
                  )}
                >
                  {form.images.length + pendingImages.length}/{MAX_TASK_IMAGES}
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || form.files.length + pendingFiles.length >= MAX_TASK_FILES}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  form.files.length + pendingFiles.length > 0
                    ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                )}
                title={`Tối đa ${MAX_TASK_FILES} tệp, mỗi tệp không quá 20 MB`}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Chọn tệp
                <span
                  className={cn(
                    "text-[10px]",
                    form.files.length + pendingFiles.length > 0
                      ? "text-blue-400"
                      : "text-gray-400"
                  )}
                >
                  {form.files.length + pendingFiles.length}/{MAX_TASK_FILES}
                </span>
              </button>
              <button
                type="button"
                onClick={addLinkRow}
                disabled={submitting || form.links.length >= MAX_TASK_LINKS}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  form.links.length > 0
                    ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                )}
                title={`Tối đa ${MAX_TASK_LINKS} liên kết`}
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm liên kết
                <span
                  className={cn(
                    "text-[10px]",
                    form.links.length > 0 ? "text-blue-400" : "text-gray-400"
                  )}
                >
                  {form.links.length}/{MAX_TASK_LINKS}
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
                handleImageSelection(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleFileSelection(event.target.files);
                event.target.value = "";
              }}
            />

            {(form.files.length > 0 || pendingFiles.length > 0) && (
              <ul className="space-y-2">
                {form.files.map((fileItem) => (
                  <li
                    key={fileItem.url}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <a
                      href={fileItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-blue-600"
                    >
                      {fileItem.name}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeSavedFile(fileItem.url)}
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
                    className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                      {pending.file.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Chưa lưu
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(pending.id)}
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
            {form.links.length > 0 && (
              <div className="space-y-2">
                {form.links.map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label ?? ""}
                      onChange={(event) => updateLinkRow(index, { label: event.target.value })}
                      placeholder="Tên đường dẫn"
                      className="h-9 w-[38%] rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(event) => updateLinkRow(index, { url: event.target.value })}
                      placeholder="https://..."
                      className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeLinkRow(index)}
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

            {(form.images.length > 0 || pendingImages.length > 0) && (
              <ul className="flex gap-2.5 overflow-x-auto pb-1">
                {form.images.map((url, index) => (
                  <li
                    key={url}
                    className="group relative w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* URL Cloudinary động nên dùng img thay vì giới hạn hostname của next/image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Ảnh Task ${index + 1}`}
                        className="h-16 w-24 object-cover"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeSavedImage(url)}
                      disabled={submitting}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-gray-950/70 text-white shadow-sm transition hover:bg-rose-600"
                      aria-label={`Xóa ảnh Task ${index + 1}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {pendingImages.map((image) => (
                  <li
                    key={image.id}
                    className="group relative w-24 shrink-0 overflow-hidden rounded-lg border border-blue-200 bg-blue-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="h-16 w-24 object-cover"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                      Chưa lưu
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingImage(image.id)}
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
            {imageError && (
              <p role="alert" className="text-xs text-rose-600">
                {imageError}
              </p>
            )}
            {fileError && (
              <p role="alert" className="text-xs text-rose-600">
                {fileError}
              </p>
            )}
            {errors.links && <p className="text-xs text-rose-500">{errors.links}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Thuộc công việc <span className="text-rose-500">*</span>
            </label>
            <WorkTaskSelect
              options={workTasks}
              value={form.workTaskId}
              onChange={handleWorkTaskChange}
              invalid={Boolean(errors.workTaskId)}
            />
            {errors.workTaskId && <p className="mt-1 text-xs text-rose-500">{errors.workTaskId}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Người thực hiện <span className="text-rose-500">*</span>
            </label>
            <MemberMultiSelect
              options={workTaskAssignees}
              value={form.assigneeIds}
              onChange={(ids) => {
                setForm((prev) => ({ ...prev, assigneeIds: ids }));
                setErrors((prev) => ({ ...prev, assigneeIds: undefined }));
              }}
              placeholder="Chọn người thực hiện..."
              emptyHint={
                form.workTaskId
                  ? "Công việc này chưa có người phụ trách"
                  : "Hãy chọn công việc trước"
              }
              disabled={!form.workTaskId}
              invalid={Boolean(errors.assigneeIds)}
            />
            <p className="mt-1 text-xs text-gray-400">
              {form.workTaskId
                ? "Chỉ hiển thị người phụ trách công việc đã chọn; người đầu tiên là phụ trách chính."
                : "Chọn công việc trước để hiện danh sách người phụ trách."}
            </p>
            {errors.assigneeIds && (
              <p className="mt-1 text-xs text-rose-500">{errors.assigneeIds}</p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Trạng thái</label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as FormState["status"] }))
                }
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Mức độ ưu tiên</label>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priority: event.target.value as FormState["priority"] }))
                }
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Tiến độ thực tế (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(event) => setForm((prev) => ({ ...prev, progress: Number(event.target.value) }))}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Ngày bắt đầu <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                  errors.startDate ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
                )}
              />
              {errors.startDate && <p className="mt-1 text-xs text-rose-500">{errors.startDate}</p>}
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Ngày hoàn thành <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                  errors.dueDate ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
                )}
              />
              {errors.dueDate && <p className="mt-1 text-xs text-rose-500">{errors.dueDate}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nhãn tags (Cách nhau bằng dấu phẩy)</label>
            <input
              type="text"
              value={form.tagsText}
              onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))}
              placeholder="VD: Thi công, Khảo sát..."
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {submitError && <p className="text-sm text-rose-500">{submitError}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting || workTasks.length === 0 || members.length === 0}>
            {submitting
              ? "Đang lưu..."
              : workTasks.length === 0
                ? "Chưa có công việc"
                : members.length === 0
                  ? "Chưa có nhân sự"
                  : mode === "edit"
                    ? "Cập nhật"
                    : "Tạo mới"}
          </Button>
        </div>
      </form>
    </div>
  );
}
