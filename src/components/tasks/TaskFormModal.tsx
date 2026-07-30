"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ImagePlus, Paperclip, Plus, Trash2, X } from "lucide-react";
import type {
  TaskFileAttachment,
  TaskLinkAttachment,
  WorkTask,
  WorkTaskInput,
} from "@/types/task";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { taskService } from "@/services/task-service";
import { toDateInputValue, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

interface TaskFormModalProps {
  mode: "create" | "edit";
  task?: WorkTask;
  projects: Project[];
  members: ProjectMember[];
  otherTasks: WorkTask[];
  defaultProjectId?: string;
  defaultStatus?: WorkTaskInput["status"];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  projectId: string;
  assigneeIds: string[];
  status: WorkTaskInput["status"];
  priority: WorkTaskInput["priority"];
  startDate: string;
  dueDate: string;
  tagsText: string;
  dependsOnTaskId: string;
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

/** Người tham gia dự án = người quản lý + thành viên, không trùng lặp. */
function participantsOf(project: Project | undefined): ProjectMember[] {
  if (!project) return [];
  const seen = new Set<string>();
  return [...project.managers, ...project.members].filter((member) => {
    if (seen.has(member.id)) return false;
    seen.add(member.id);
    return true;
  });
}

function buildInitialState(
  task: WorkTask | undefined,
  projects: Project[],
  defaultProjectId?: string,
  defaultStatus?: WorkTaskInput["status"]
): FormState {
  if (task) {
    return {
      title: task.title,
      description: task.description ?? "",
      projectId: task.projectId,
      assigneeIds: task.assignees.map((member) => member.id),
      status: task.status,
      priority: task.priority,
      startDate: toDateInputValue(task.startDate),
      dueDate: toDateInputValue(task.dueDate),
      tagsText: task.tags.join(", "),
      dependsOnTaskId: task.dependsOnTaskId ?? "",
      files: task.files,
      links: task.links,
      images: task.images,
    };
  }
  return {
    title: "",
    description: "",
    projectId: defaultProjectId ?? projects[0]?.id ?? "",
    assigneeIds: [],
    status: defaultStatus ?? "todo",
    priority: "low",
    startDate: toDateInputValue(new Date().toISOString()),
    dueDate: "",
    tagsText: "",
    dependsOnTaskId: "",
    files: [],
    links: [],
    images: [],
  };
}

export function TaskFormModal({
  mode,
  task,
  projects,
  members,
  otherTasks,
  defaultProjectId,
  defaultStatus,
  onClose,
  onSaved,
}: TaskFormModalProps) {
  const { notify } = useFeedback();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(task, projects, defaultProjectId, defaultStatus)
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

  const projectParticipants = useMemo(
    () => participantsOf(projects.find((project) => project.id === form.projectId)),
    [projects, form.projectId]
  );

  /** Đổi dự án thì bỏ những người không còn tham gia dự án mới. */
  function handleProjectChange(projectId: string) {
    const allowed = new Set(
      participantsOf(projects.find((project) => project.id === projectId)).map(
        (member) => member.id
      )
    );
    setForm((prev) => ({
      ...prev,
      projectId,
      assigneeIds: prev.assigneeIds.filter((id) => allowed.has(id)),
    }));
    setErrors((prev) => ({ ...prev, projectId: undefined }));
  }

  function handleImageSelection(files: FileList | null) {
    if (!files?.length) return;

    const availableSlots =
      MAX_TASK_IMAGES - form.images.length - pendingImages.length;
    if (availableSlots <= 0) {
      setImageError(`Mỗi công việc chỉ được lưu tối đa ${MAX_TASK_IMAGES} ảnh.`);
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
      setFileError(`Mỗi công việc chỉ được đính kèm tối đa ${MAX_TASK_FILES} tệp.`);
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
    if (!form.title.trim()) nextErrors.title = "Vui lòng nhập tên công việc";
    if (!form.projectId) nextErrors.projectId = "Vui lòng chọn dự án";
    if (form.assigneeIds.length === 0) {
      nextErrors.assigneeIds = projectParticipants.length === 0
        ? "Dự án chưa có thành viên. Hãy thêm người vào dự án trước."
        : "Vui lòng chọn ít nhất một người phụ trách";
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
        Promise.all(pendingImages.map((image) => taskService.uploadImage(image.file))),
        Promise.all(pendingFiles.map((pending) => taskService.uploadFile(pending.file))),
      ]);
      const input: WorkTaskInput = {
        title: form.title.trim(),
        description: form.description || undefined,
        projectId: form.projectId,
        assigneeIds: form.assigneeIds,
        status: form.status,
        priority: form.priority,
        startDate: form.startDate,
        dueDate: form.dueDate,
        progress: task?.progress ?? 0,
        files: [...form.files, ...uploadedFiles],
        links: normalizedLinks(),
        images: [...form.images, ...uploadedImages],
        tags: form.tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        dependsOnTaskId: form.dependsOnTaskId || undefined,
      };

      if (mode === "edit" && task) {
        await taskService.updateTask(task.id, input);
      } else {
        await taskService.createTask(input);
      }
      notify({
        type: "success",
        title: mode === "edit" ? "Đã cập nhật công việc" : "Đã tạo công việc",
        description: `Công việc “${input.title}” đã được lưu thành công.`,
      });
      onSaved();
    } catch (error) {
      const message = getErrorMessage(error, "Không thể lưu công việc. Vui lòng thử lại.");
      setSubmitError(message);
      notify({ type: "error", title: "Lưu công việc thất bại", description: message });
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
        aria-labelledby="task-form-title"
        className="account-dialog flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 id="task-form-title" className="text-lg font-bold text-gray-900">
            {mode === "edit" ? "Chỉnh sửa công việc" : "Thêm công việc mới"}
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
          {(projects.length === 0 || members.length === 0) && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {projects.length === 0
                ? "Chưa có dự án. Hãy tạo dự án trước khi tạo công việc."
                : "Chưa có nhân sự đang hoạt động trong Supabase để giao công việc."}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Tên công việc <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="VD: Lập trình giao diện, thiết kế logo..."
              className={cn(
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                errors.title ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
              )}
            />
            {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Mô tả công việc</label>
            <textarea
              ref={descriptionRef}
              value={form.description}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, description: event.target.value }));
                resizeDescriptionTextarea(event.target);
              }}
              placeholder="Chi tiết yêu cầu công việc..."
              rows={3}
              style={{ maxHeight: DESCRIPTION_MAX_HEIGHT }}
              className="w-full resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tệp đính kèm</label>
                <p className="mt-0.5 text-xs text-gray-400">
                  Tối đa {MAX_TASK_FILES} tệp, mỗi tệp không quá 20 MB. Hệ thống sẽ tự động tải lên Google Drive.
                </p>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {form.files.length + pendingFiles.length}/{MAX_TASK_FILES} tệp
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || form.files.length + pendingFiles.length >= MAX_TASK_FILES}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Paperclip className="h-5 w-5" />
              Chọn nhiều tệp
            </button>
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
              <ul className="mt-3 space-y-2">
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
            {fileError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {fileError}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Liên kết</label>
                <p className="mt-0.5 text-xs text-gray-400">
                  Thêm liên kết tham khảo, gồm tên đường dẫn và đường dẫn.
                </p>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {form.links.length}/{MAX_TASK_LINKS} liên kết
              </span>
            </div>

            {form.links.length > 0 && (
              <div className="space-y-2">
                {form.links.map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label ?? ""}
                      onChange={(event) => updateLinkRow(index, { label: event.target.value })}
                      placeholder="Tên đường dẫn"
                      className="h-10 w-[38%] rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(event) => updateLinkRow(index, { url: event.target.value })}
                      placeholder="https://..."
                      className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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

            <button
              type="button"
              onClick={addLinkRow}
              disabled={submitting || form.links.length >= MAX_TASK_LINKS}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Thêm liên kết
            </button>
            {errors.links && <p className="mt-1 text-xs text-rose-500">{errors.links}</p>}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Hình ảnh công việc</label>
                <p className="mt-0.5 text-xs text-gray-400">
                  Tối đa {MAX_TASK_IMAGES} ảnh, mỗi ảnh không quá 10 MB.
                </p>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {form.images.length + pendingImages.length}/{MAX_TASK_IMAGES} ảnh
              </span>
            </div>

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={
                submitting ||
                form.images.length + pendingImages.length >= MAX_TASK_IMAGES
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
              Chọn nhiều ảnh
            </button>
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

            {(form.images.length > 0 || pendingImages.length > 0) && (
              <ul className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
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
                        alt={`Ảnh công việc ${index + 1}`}
                        className="h-16 w-24 object-cover"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeSavedImage(url)}
                      disabled={submitting}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-gray-950/70 text-white shadow-sm transition hover:bg-rose-600"
                      aria-label={`Xóa ảnh công việc ${index + 1}`}
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
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {imageError}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Thuộc dự án <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.projectId}
              onChange={(event) => handleProjectChange(event.target.value)}
              className={cn(
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                errors.projectId ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
              )}
            >
              <option value="" disabled>
                Chọn dự án trước
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
            {errors.projectId && <p className="mt-1 text-xs text-rose-500">{errors.projectId}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Người phụ trách <span className="text-rose-500">*</span>
            </label>
            <MemberMultiSelect
              options={projectParticipants}
              value={form.assigneeIds}
              onChange={(ids) => {
                setForm((prev) => ({ ...prev, assigneeIds: ids }));
                setErrors((prev) => ({ ...prev, assigneeIds: undefined }));
              }}
              placeholder="Chọn người phụ trách..."
              emptyHint={
                form.projectId
                  ? "Dự án này chưa có thành viên nào"
                  : "Hãy chọn dự án trước"
              }
              disabled={!form.projectId}
              invalid={Boolean(errors.assigneeIds)}
            />
            <p className="mt-1 text-xs text-gray-400">
              {form.projectId
                ? "Chỉ hiển thị người tham gia dự án đã chọn; người đầu tiên là phụ trách chính."
                : "Chọn dự án trước để hiện danh sách người tham gia."}
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
              placeholder="VD: Frontend, UI/UX, API"
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Công việc tiền đề (Phải xong trước)</label>
            <select
              value={form.dependsOnTaskId}
              onChange={(event) => setForm((prev) => ({ ...prev, dependsOnTaskId: event.target.value }))}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Không có</option>
              {otherTasks
                .filter((item) => item.id !== task?.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </div>

          {submitError && <p className="text-sm text-rose-500">{submitError}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting || projects.length === 0 || members.length === 0}>
            {submitting
              ? "Đang lưu..."
              : projects.length === 0
                ? "Chưa có dự án"
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
