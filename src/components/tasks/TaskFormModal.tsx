"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import type {
  TaskFileAttachment,
  TaskLinkAttachment,
  WorkTask,
  WorkTaskInput,
} from "@/types/task";
import {
  TASK_PRIORITY_OPTIONS,
} from "@/types/task";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import { taskService } from "@/services/task-service";
import { toDateInputValue, getAppDateKey, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { TaskAttachmentFields } from "@/components/tasks/TaskAttachmentFields";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";
import { buildFormDraftKey, useVersionedFormDraft } from "@/hooks/useVersionedFormDraft";
import { FormDraftBanner, RememberDraftToggle } from "@/components/ui/FormDraftBanner";
import { runUploadBatch } from "@/lib/upload-concurrency";

interface TaskFormModalProps {
  mode: "create" | "edit";
  task?: WorkTask;
  projects: ProjectDirectoryItem[];
  members: ProjectMember[];
  otherTasks: import("@/types/task").WorkTaskDirectoryItem[];
  defaultProjectId?: string;
  defaultStatus?: WorkTaskInput["status"];
  onClose: () => void;
  /**
   * Trang danh sách truyền callback này để optimistic-update từ response API.
   * `idempotencyKey` chỉ có giá trị ở `mode === "create"` — GĐ9 (idempotency).
   */
  onSave?: (input: WorkTaskInput, idempotencyKey?: string) => Promise<WorkTask | null>;
  /** Tương thích với các màn hình chi tiết chưa dùng optimistic update. */
  onSaved?: (task: WorkTask) => void;
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

/** Phần của FormState lưu được vào bản nháp (GĐ7) — loại `files`/`links`/`images`. */
type TaskDraftData = Pick<
  FormState,
  "title" | "description" | "projectId" | "assigneeIds" | "status" | "priority" | "startDate" | "dueDate" | "tagsText" | "dependsOnTaskId"
>;

interface PendingTaskImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface PendingTaskFile {
  id: string;
  file: File;
  description?: string;
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

const PRIORITY_DOT_CLASS: Record<WorkTaskInput["priority"], string> = {
  low: "bg-gray-400",
  medium: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
};

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
function participantsOf(project: ProjectDirectoryItem | undefined): ProjectMember[] {
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
  projects: ProjectDirectoryItem[],
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
  const projectId = defaultProjectId ?? projects[0]?.id ?? "";
  const selectedProject = projects.find((project) => project.id === projectId);
  return {
    title: "",
    description: "",
    projectId,
    assigneeIds: [],
    status: defaultStatus ?? "todo",
    priority: "low",
    startDate: getAppDateKey(),
    dueDate: selectedProject ? toDateInputValue(selectedProject.endDate) : "",
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
  onSave,
  onSaved,
}: TaskFormModalProps) {
  const { notify } = useFeedback();
  const { account } = useCurrentAccount();
  const draftStorageKey = account
    ? buildFormDraftKey({ accountId: account.id, formType: "task", mode, entityId: task?.id })
    : null;
  const { draft, scheduleSave, clearDraft, persistent, setPersistent } = useVersionedFormDraft<TaskDraftData>({
    storageKey: draftStorageKey,
    entityVersion: task?.updatedAt,
  });
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  // Xem chú thích tương ứng trong ProjectFormModal.tsx — GĐ9 (idempotency).
  const [createIdempotencyKey] = useState<string | undefined>(() =>
    mode === "create" ? crypto.randomUUID() : undefined
  );
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(task, projects, defaultProjectId, defaultStatus)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingTaskImage[]>([]);
  const [imageError, setImageError] = useState("");
  const pendingImagesRef = useRef<PendingTaskImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingTaskFile[]>([]);
  const [fileError, setFileError] = useState("");
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
    scheduleSave({
      title: form.title,
      description: form.description,
      projectId: form.projectId,
      assigneeIds: form.assigneeIds,
      status: form.status,
      priority: form.priority,
      startDate: form.startDate,
      dueDate: form.dueDate,
      tagsText: form.tagsText,
      dependsOnTaskId: form.dependsOnTaskId,
    });
  }, [
    form.title,
    form.description,
    form.projectId,
    form.assigneeIds,
    form.status,
    form.priority,
    form.startDate,
    form.dueDate,
    form.tagsText,
    form.dependsOnTaskId,
    scheduleSave,
  ]);

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
      if (event.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.projectId),
    [projects, form.projectId]
  );
  const projectParticipants = useMemo(() => participantsOf(selectedProject), [selectedProject]);
  const projectStartDate = selectedProject
    ? toDateInputValue(selectedProject.startDate)
    : undefined;
  const projectEndDate = selectedProject
    ? toDateInputValue(selectedProject.endDate)
    : undefined;

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.name,
        sublabel: project.code,
      })),
    [projects]
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        dotClassName: PRIORITY_DOT_CLASS[option.value],
      })),
    []
  );

  const dependencyOptions = useMemo(
    () => [
      { value: "", label: "Không có" },
      ...otherTasks
        .filter((item) => item.id !== task?.id)
        .map((item) => ({
          value: item.id,
          label: item.title,
        })),
    ],
    [otherTasks, task?.id]
  );

  /** Đổi dự án thì bỏ những người không còn tham gia dự án mới. */
  function handleProjectChange(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    const allowed = new Set(participantsOf(project).map((member) => member.id));
    setForm((prev) => ({
      ...prev,
      projectId,
      assigneeIds: prev.assigneeIds.filter((id) => allowed.has(id)),
      startDate: getAppDateKey(),
      dueDate: project ? toDateInputValue(project.endDate) : "",
    }));
    setErrors((prev) => ({
      ...prev,
      projectId: undefined,
      startDate: undefined,
      dueDate: undefined,
    }));
  }

  function handleImageSelection(files: FileList | File[] | null) {
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

  function updateSavedFile(url: string, patch: Partial<TaskFileAttachment>) {
    setForm((current) => ({
      ...current,
      files: current.files.map((file) => file.url === url ? { ...file, ...patch } : file),
    }));
  }

  function updatePendingFile(id: string, patch: { description?: string }) {
    setPendingFiles((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file));
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
      .map((link) => ({
        label: link.label?.trim() || undefined,
        url: link.url.trim(),
        description: link.description?.trim() || undefined,
      }))
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
    if (projectStartDate && projectEndDate) {
      const dateRangeMessage =
        "Thời gian công việc phải nằm trong khoảng thời gian của dự án";
      if (
        form.startDate &&
        (form.startDate < projectStartDate || form.startDate > projectEndDate)
      ) {
        nextErrors.startDate = dateRangeMessage;
      }
      if (
        form.dueDate &&
        (form.dueDate < projectStartDate || form.dueDate > projectEndDate)
      ) {
        nextErrors.dueDate = dateRangeMessage;
      }
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

    startTransition(async () => {
      setSubmitError(null);
      try {
        const uploadedImages: string[] = [];
        const uploadedFiles: TaskFileAttachment[] = [];
        const uploadResult = await runUploadBatch([
          ...pendingImages.map((image) => ({
            id: image.id,
            upload: async () => { uploadedImages.push(await taskService.uploadImage(image.file)); },
          })),
          ...pendingFiles.map((pending) => ({
            id: pending.id,
            upload: async () => {
              const uploaded = await taskService.uploadFile(pending.file);
              uploadedFiles.push({ ...uploaded, description: pending.description?.trim() || undefined });
            },
          })),
        ]);
        const uploadedIds = new Set(uploadResult.succeededIds);
        if (uploadedImages.length || uploadedFiles.length) {
          setForm((current) => ({
            ...current,
            images: [...current.images, ...uploadedImages],
            files: [...current.files, ...uploadedFiles],
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

        const saved = onSave
          ? await onSave(input, createIdempotencyKey)
          : mode === "edit" && task
            ? await taskService.updateTask(task.id, input)
            : await taskService.createTask(input, { idempotencyKey: createIdempotencyKey });
        if (!saved) throw new Error("Không tìm thấy công việc để cập nhật.");
        notify({
          type: "success",
          title: mode === "edit" ? "Đã cập nhật công việc" : "Đã tạo công việc",
          description: `Công việc “${input.title}” đã được lưu thành công.`,
        });
        clearDraft();
        onSaved?.(saved);
        onClose();
      } catch (error) {
        const message = getErrorMessage(error, "Không thể lưu công việc. Vui lòng thử lại.");
        setSubmitError(message);
        notify({ type: "error", title: "Lưu công việc thất bại", description: message });
      }
    });
  }

  return (
    <div
      className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose();
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
            disabled={isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
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
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-brand-100",
                errors.title ? "border-rose-400" : "border-gray-200 focus:border-brand-400"
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
              className="w-full resize-none overflow-y-auto rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <TaskAttachmentFields
            label="Đính kèm công việc"
            entityLabel="công việc"
            files={form.files}
            pendingFiles={pendingFiles}
            links={form.links}
            images={form.images}
            pendingImages={pendingImages}
            maxFiles={MAX_TASK_FILES}
            maxLinks={MAX_TASK_LINKS}
            maxImages={MAX_TASK_IMAGES}
            submitting={isPending}
            fileError={fileError}
            linkError={errors.links}
            imageError={imageError}
            onSelectFiles={handleFileSelection}
            onSelectImages={handleImageSelection}
            onAddLink={addLinkRow}
            onUpdateLink={updateLinkRow}
            onRemoveLink={removeLinkRow}
            onRemoveSavedFile={removeSavedFile}
            onRemovePendingFile={removePendingFile}
            onUpdateSavedFile={updateSavedFile}
            onUpdatePendingFile={updatePendingFile}
            onRemoveSavedImage={removeSavedImage}
            onRemovePendingImage={removePendingImage}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Thuộc dự án <span className="text-rose-500">*</span>
            </label>
            <SingleSelectDropdown
              options={projectOptions}
              value={form.projectId}
              onChange={handleProjectChange}
              placeholder="Chọn dự án..."
              emptyHint="Chưa có dự án để chọn"
              searchable
              searchPlaceholder="Nhập tên hoặc mã dự án..."
              invalid={Boolean(errors.projectId)}
              showSelectionIndicator={false}
            />
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Mức độ ưu tiên</label>
            <SingleSelectDropdown
              options={priorityOptions}
              value={form.priority}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, priority: value as FormState["priority"] }))
              }
              showSelectionIndicator={false}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Ngày bắt đầu <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                min={projectStartDate}
                max={projectEndDate}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, startDate: event.target.value }));
                  setErrors((prev) => ({ ...prev, startDate: undefined }));
                }}
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-brand-100",
                  errors.startDate ? "border-rose-400" : "border-gray-200 focus:border-brand-400"
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
                min={projectStartDate}
                max={projectEndDate}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, dueDate: event.target.value }));
                  setErrors((prev) => ({ ...prev, dueDate: undefined }));
                }}
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-brand-100",
                  errors.dueDate ? "border-rose-400" : "border-gray-200 focus:border-brand-400"
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
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Công việc tiền đề (Phải xong trước)</label>
            <SingleSelectDropdown
              options={dependencyOptions}
              value={form.dependsOnTaskId}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, dependsOnTaskId: value }))
              }
              searchable={dependencyOptions.length > 6}
              searchPlaceholder="Nhập tên công việc..."
            />
          </div>

          {submitError && <p className="text-sm text-rose-500">{submitError}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          {setPersistent && <RememberDraftToggle checked={persistent} onChange={setPersistent} />}
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || projects.length === 0 || members.length === 0}>
              {isPending
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
        </div>
      </form>
    </div>
  );
}
