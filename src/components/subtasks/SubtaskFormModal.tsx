"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Subtask,
  SubtaskInput,
  SubtaskUpdateEntry,
  TaskFileAttachment,
  TaskLinkAttachment,
} from "@/types/subtask";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_META,
  TASK_STATUS_OPTIONS,
  type TaskStatus,
  type WorkTaskDirectoryItem,
} from "@/types/task";
import type { ProjectMember } from "@/types/project";
import { subtaskService } from "@/services/subtask-service";
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

interface SubtaskFormModalProps {
  mode: "create" | "edit";
  subtask?: Subtask;
  workTasks: WorkTaskDirectoryItem[];
  members: ProjectMember[];
  defaultWorkTaskId?: string;
  onClose: () => void;
  onSaved: (subtask: Subtask) => void;
}

interface UpdateEntryFormState {
  id: string;
  createdAt: string;
  description: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
}

interface FormState {
  title: string;
  description: string;
  workTaskId: string;
  assigneeIds: string[];
  status: TaskStatus;
  priority: SubtaskInput["priority"];
  startDate: string;
  dueDate: string;
  progress: number;
  tagsText: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
  updates: UpdateEntryFormState[];
}

/** Phần của FormState lưu được vào bản nháp (GĐ7) — loại `files`/`links`/`images`. */
type SubtaskDraftData = Pick<
  FormState,
  "title" | "description" | "workTaskId" | "assigneeIds" | "status" | "priority" | "startDate" | "dueDate" | "progress" | "tagsText"
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

const PRIORITY_DOT_CLASS: Record<SubtaskInput["priority"], string> = {
  low: "bg-gray-400",
  medium: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
};

const PRIORITY_SELECT_OPTIONS = TASK_PRIORITY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  dotClassName: PRIORITY_DOT_CLASS[option.value],
}));

const STATUS_SELECT_OPTIONS = TASK_STATUS_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  dotClassName: TASK_STATUS_META[option.value].dot,
}));

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
  workTasks: WorkTaskDirectoryItem[],
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
      updates: subtask.updates.map((entry) => ({
        ...entry,
        description: entry.description ?? "",
      })),
    };
  }
  const workTaskId = defaultWorkTaskId ?? workTasks[0]?.id ?? "";
  const selectedWorkTask = workTasks.find((item) => item.id === workTaskId);
  return {
    title: "",
    description: "",
    workTaskId,
    assigneeIds: [],
    status: "todo",
    priority: "low",
    startDate: getAppDateKey(),
    dueDate: selectedWorkTask ? toDateInputValue(selectedWorkTask.dueDate) : "",
    progress: 0,
    tagsText: "",
    files: [],
    links: [],
    images: [],
    updates: [],
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
  options: WorkTaskDirectoryItem[];
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
              ? "border-brand-400 ring-2 ring-brand-100"
              : "border-gray-200"
        )}
      >
        {selected && (
          <span
            className="flex min-w-0 max-w-[70%] items-center rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
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
              className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
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
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-brand-50",
                    isSelected && "bg-brand-50 hover:bg-brand-50"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                    {option.title}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
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
  const { account } = useCurrentAccount();
  const draftStorageKey = account
    ? buildFormDraftKey({ accountId: account.id, formType: "subtask", mode, entityId: subtask?.id })
    : null;
  const { draft, scheduleSave, clearDraft, persistent, setPersistent } = useVersionedFormDraft<SubtaskDraftData>({
    storageKey: draftStorageKey,
    entityVersion: subtask?.updatedAt,
  });
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  // Xem chú thích tương ứng trong ProjectFormModal.tsx — GĐ9 (idempotency).
  const [createIdempotencyKey] = useState<string | undefined>(() =>
    mode === "create" ? crypto.randomUUID() : undefined
  );
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(subtask, workTasks, defaultWorkTaskId)
  );
  const [selectedUpdateId, setSelectedUpdateId] = useState("initial");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingTaskImage[]>([]);
  const [imageError, setImageError] = useState("");
  const pendingImagesRef = useRef<PendingTaskImage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingTaskFile[]>([]);
  const [fileError, setFileError] = useState("");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [entryPendingImages, setEntryPendingImages] = useState<Record<string, PendingTaskImage[]>>({});
  const [entryPendingFiles, setEntryPendingFiles] = useState<Record<string, PendingTaskFile[]>>({});
  const [entryImageErrors, setEntryImageErrors] = useState<Record<string, string>>({});
  const [entryFileErrors, setEntryFileErrors] = useState<Record<string, string>>({});
  const [entryLinkErrors, setEntryLinkErrors] = useState<Record<string, string>>({});
  const entryPendingImagesRef = useRef<Record<string, PendingTaskImage[]>>({});

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
      workTaskId: form.workTaskId,
      assigneeIds: form.assigneeIds,
      status: form.status,
      priority: form.priority,
      startDate: form.startDate,
      dueDate: form.dueDate,
      progress: form.progress,
      tagsText: form.tagsText,
    });
  }, [
    form.title,
    form.description,
    form.workTaskId,
    form.assigneeIds,
    form.status,
    form.priority,
    form.startDate,
    form.dueDate,
    form.progress,
    form.tagsText,
    scheduleSave,
  ]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    entryPendingImagesRef.current = entryPendingImages;
  }, [entryPendingImages]);

  useEffect(
    () => () => {
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      for (const images of Object.values(entryPendingImagesRef.current)) {
        for (const image of images) URL.revokeObjectURL(image.previewUrl);
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

  const selectedWorkTask = useMemo(
    () => workTasks.find((item) => item.id === form.workTaskId),
    [workTasks, form.workTaskId]
  );
  const workTaskAssignees = selectedWorkTask?.assignees ?? [];
  const workTaskStartDate = selectedWorkTask
    ? toDateInputValue(selectedWorkTask.startDate)
    : undefined;
  const workTaskDueDate = selectedWorkTask
    ? toDateInputValue(selectedWorkTask.dueDate)
    : undefined;

  /** Đổi công việc thì bỏ những người không phụ trách công việc mới. */
  function handleWorkTaskChange(workTaskId: string) {
    const workTask = workTasks.find((item) => item.id === workTaskId);
    const allowed = new Set((workTask?.assignees ?? []).map((member) => member.id));
    setForm((prev) => ({
      ...prev,
      workTaskId,
      assigneeIds: prev.assigneeIds.filter((id) => allowed.has(id)),
      startDate: getAppDateKey(),
      dueDate: workTask ? toDateInputValue(workTask.dueDate) : "",
    }));
    setErrors((prev) => ({
      ...prev,
      workTaskId: undefined,
      startDate: undefined,
      dueDate: undefined,
    }));
  }

  function handleImageSelection(files: FileList | File[] | null) {
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

  function updateSavedFile(url: string, patch: Partial<TaskFileAttachment>) {
    setForm((current) => ({
      ...current,
      files: current.files.map((file) => file.url === url ? { ...file, ...patch } : file),
    }));
  }

  function updatePendingFile(id: string, patch: { description?: string }) {
    setPendingFiles((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file));
  }

  function updateEntry(id: string, updater: (entry: UpdateEntryFormState) => UpdateEntryFormState) {
    setForm((current) => ({
      ...current,
      updates: current.updates.map((entry) => entry.id === id ? updater(entry) : entry),
    }));
  }

  function addUpdateEntry() {
    const id = crypto.randomUUID();
    setForm((current) => ({
      ...current,
      updates: [...current.updates, {
        id,
        createdAt: new Date().toISOString(),
        description: "",
        files: [],
        links: [],
        images: [],
      }],
    }));
    setSelectedUpdateId(id);
  }

  function removeUpdateEntry(id: string) {
    setSelectedUpdateId("initial");
    setForm((current) => ({ ...current, updates: current.updates.filter((entry) => entry.id !== id) }));
    setEntryPendingImages((current) => {
      for (const image of current[id] ?? []) URL.revokeObjectURL(image.previewUrl);
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEntryPendingFiles((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleEntryImageSelection(id: string, files: FileList | File[] | null) {
    if (!files?.length) return;
    const entry = form.updates.find((item) => item.id === id);
    if (!entry) return;
    const availableSlots = MAX_TASK_IMAGES - entry.images.length - (entryPendingImages[id]?.length ?? 0);
    if (availableSlots <= 0) {
      setEntryImageErrors((current) => ({ ...current, [id]: `Mỗi lần chỉ được lưu tối đa ${MAX_TASK_IMAGES} ảnh.` }));
      return;
    }
    const selected = Array.from(files);
    const invalid = selected.find((file) => !ALLOWED_TASK_IMAGE_TYPES.has(file.type));
    if (invalid) {
      setEntryImageErrors((current) => ({ ...current, [id]: "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF." }));
      return;
    }
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_TASK_IMAGE_SIZE);
    if (oversized) {
      setEntryImageErrors((current) => ({ ...current, [id]: `Ảnh “${oversized.name}” phải có dung lượng tối đa 10 MB.` }));
      return;
    }
    const additions = selected.slice(0, availableSlots).map((file) => ({
      id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file),
    }));
    setEntryPendingImages((current) => ({ ...current, [id]: [...(current[id] ?? []), ...additions] }));
    setEntryImageErrors((current) => ({
      ...current,
      [id]: selected.length > availableSlots ? `Chỉ thêm ${availableSlots} ảnh để không vượt quá giới hạn.` : "",
    }));
  }

  function handleEntryFileSelection(id: string, files: FileList | null) {
    if (!files?.length) return;
    const entry = form.updates.find((item) => item.id === id);
    if (!entry) return;
    const availableSlots = MAX_TASK_FILES - entry.files.length - (entryPendingFiles[id]?.length ?? 0);
    if (availableSlots <= 0) {
      setEntryFileErrors((current) => ({ ...current, [id]: `Mỗi lần chỉ được đính kèm tối đa ${MAX_TASK_FILES} tệp.` }));
      return;
    }
    const selected = Array.from(files);
    const oversized = selected.find((file) => file.size === 0 || file.size > MAX_TASK_FILE_SIZE);
    if (oversized) {
      setEntryFileErrors((current) => ({ ...current, [id]: `Tệp “${oversized.name}” phải có dung lượng tối đa 20 MB.` }));
      return;
    }
    const additions = selected.slice(0, availableSlots).map((file) => ({ id: crypto.randomUUID(), file }));
    setEntryPendingFiles((current) => ({ ...current, [id]: [...(current[id] ?? []), ...additions] }));
    setEntryFileErrors((current) => ({
      ...current,
      [id]: selected.length > availableSlots ? `Chỉ thêm ${availableSlots} tệp để không vượt quá giới hạn.` : "",
    }));
  }

  function removeEntryPendingImage(id: string, imageId: string) {
    setEntryPendingImages((current) => {
      const target = (current[id] ?? []).find((image) => image.id === imageId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return { ...current, [id]: (current[id] ?? []).filter((image) => image.id !== imageId) };
    });
  }

  function normalizeLinks(links: TaskLinkAttachment[]): TaskLinkAttachment[] {
    return links.map((link) => ({
      label: link.label?.trim() || undefined,
      url: link.url.trim(),
      description: link.description?.trim() || undefined,
    })).filter((link) => link.url);
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
    return normalizeLinks(form.links);
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
    if (workTaskStartDate && workTaskDueDate) {
      const dateRangeMessage =
        "Thời gian task phải nằm trong khoảng thời gian của công việc";
      if (
        form.startDate &&
        (form.startDate < workTaskStartDate || form.startDate > workTaskDueDate)
      ) {
        nextErrors.startDate = dateRangeMessage;
      }
      if (
        form.dueDate &&
        (form.dueDate < workTaskStartDate || form.dueDate > workTaskDueDate)
      ) {
        nextErrors.dueDate = dateRangeMessage;
      }
    }
    const invalidLink = normalizedLinks().find((link) => !isValidHttpUrl(link.url));
    if (invalidLink) {
      nextErrors.links = `Liên kết “${invalidLink.url}” không hợp lệ.`;
    }
    const nextEntryLinkErrors: Record<string, string> = {};
    for (const entry of form.updates) {
      const invalidEntryLink = normalizeLinks(entry.links).find((link) => !isValidHttpUrl(link.url));
      if (invalidEntryLink) nextEntryLinkErrors[entry.id] = `Liên kết “${invalidEntryLink.url}” không hợp lệ.`;
    }
    setEntryLinkErrors(nextEntryLinkErrors);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && Object.keys(nextEntryLinkErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const uploadedImages: string[] = [];
      const uploadedFiles: TaskFileAttachment[] = [];
      const entryUploadedImages: Record<string, string[]> = Object.fromEntries(
        form.updates.map((entry) => [entry.id, []])
      );
      const entryUploadedFiles: Record<string, TaskFileAttachment[]> = Object.fromEntries(
        form.updates.map((entry) => [entry.id, []])
      );
      const uploadResult = await runUploadBatch([
        ...pendingImages.map((image) => ({
          id: image.id,
          upload: async () => { uploadedImages.push(await subtaskService.uploadImage(image.file)); },
        })),
        ...pendingFiles.map((pending) => ({
          id: pending.id,
          upload: async () => {
            const uploaded = await subtaskService.uploadFile(pending.file);
            uploadedFiles.push({ ...uploaded, description: pending.description?.trim() || undefined });
          },
        })),
        ...form.updates.flatMap((entry) => [
          ...(entryPendingImages[entry.id] ?? []).map((image) => ({
            id: image.id,
            upload: async () => {
              entryUploadedImages[entry.id].push(await subtaskService.uploadImage(image.file));
            },
          })),
          ...(entryPendingFiles[entry.id] ?? []).map((pending) => ({
            id: pending.id,
            upload: async () => {
              const uploaded = await subtaskService.uploadFile(pending.file);
              entryUploadedFiles[entry.id].push({
                ...uploaded,
                description: pending.description?.trim() || undefined,
              });
            },
          })),
        ]),
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
      setEntryPendingImages((current) => Object.fromEntries(
        Object.entries(current).map(([entryId, images]) => [entryId, images.filter((image) => {
          if (!uploadedIds.has(image.id)) return true;
          URL.revokeObjectURL(image.previewUrl);
          return false;
        })])
      ));
      setEntryPendingFiles((current) => Object.fromEntries(
        Object.entries(current).map(([entryId, files]) => [entryId, files.filter((file) => !uploadedIds.has(file.id))])
      ));
      if (form.updates.some((entry) => entryUploadedImages[entry.id].length || entryUploadedFiles[entry.id].length)) {
        setForm((current) => ({
          ...current,
          updates: current.updates.map((entry) => ({
            ...entry,
            images: [...entry.images, ...(entryUploadedImages[entry.id] ?? [])],
            files: [...entry.files, ...(entryUploadedFiles[entry.id] ?? [])],
          })),
        }));
      }
      if (uploadResult.failures.length) {
        throw new Error(`Không thể tải ${uploadResult.failures.length} tệp. Các tệp đã tải xong được giữ lại; bấm Lưu để thử lại tệp lỗi.`);
      }
      const updates: SubtaskUpdateEntry[] = form.updates.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        description: entry.description.trim() || undefined,
        files: [...entry.files, ...entryUploadedFiles[entry.id]],
        links: normalizeLinks(entry.links),
        images: [...entry.images, ...entryUploadedImages[entry.id]],
      })).filter((entry) =>
        Boolean(entry.description || entry.files.length || entry.links.length || entry.images.length)
      );
      const input: SubtaskInput = {
        title: form.title.trim(),
        description: form.description || undefined,
        workTaskId: form.workTaskId,
        assigneeIds: form.assigneeIds,
        ...(mode === "edit" && account?.role === "admin" ? { status: form.status } : {}),
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
        updates,
      };
      const saved = mode === "edit" && subtask
        ? await subtaskService.updateSubtask(subtask.id, input)
        : await subtaskService.createSubtask(input, { idempotencyKey: createIdempotencyKey });
      if (!saved) throw new Error("Không tìm thấy task để cập nhật.");
      notify({
        type: "success",
        title: mode === "edit" ? "Đã cập nhật task" : "Đã tạo task",
        description: `Task “${input.title}” đã được lưu thành công.`,
      });
      clearDraft();
      onSaved(saved);
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
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-brand-100",
                errors.title ? "border-rose-400" : "border-gray-200 focus:border-brand-400"
              )}
            />
            {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
          </div>

          <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div>
              <span className="mb-2 block text-sm font-semibold text-gray-700">Chọn lần</span>
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Chọn lần mô tả và đính kèm Task">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedUpdateId === "initial"}
                  onClick={() => setSelectedUpdateId("initial")}
                  className={cn(
                    "h-9 rounded-lg border px-3 text-sm font-semibold transition",
                    selectedUpdateId === "initial"
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-600"
                  )}
                >
                  Lần 1
                </button>
                {form.updates.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedUpdateId === entry.id}
                    onClick={() => setSelectedUpdateId(entry.id)}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm font-semibold transition",
                      selectedUpdateId === entry.id
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-600"
                    )}
                  >
                    Lần {index + 2}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addUpdateEntry}
                  disabled={submitting || form.updates.length >= 20}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 text-sm font-semibold text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Thêm lần
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">Mô tả và đính kèm được lưu riêng theo lần đang chọn.</p>
            </div>

            {selectedUpdateId === "initial" ? (
              <div className="space-y-4" role="tabpanel">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Mô tả Task — Lần 1</label>
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
                    className="w-full resize-none overflow-y-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <TaskAttachmentFields
                  label="Đính kèm — Lần 1"
                  entityLabel="Task"
                  files={form.files}
                  pendingFiles={pendingFiles}
                  links={form.links}
                  images={form.images}
                  pendingImages={pendingImages}
                  maxFiles={MAX_TASK_FILES}
                  maxLinks={MAX_TASK_LINKS}
                  maxImages={MAX_TASK_IMAGES}
                  submitting={submitting}
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
              </div>
            ) : form.updates.map((entry, index) => entry.id === selectedUpdateId ? (
              <div key={entry.id} className="space-y-4" role="tabpanel">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Mô tả Task — Lần {index + 2}</label>
                  <button
                    type="button"
                    onClick={() => removeUpdateEntry(entry.id)}
                    disabled={submitting}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa lần
                  </button>
                </div>
                <textarea
                  value={entry.description}
                  onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, description: event.target.value }))}
                  placeholder="Nội dung bổ sung..."
                  rows={3}
                  style={{ maxHeight: DESCRIPTION_MAX_HEIGHT }}
                  className="w-full resize-none overflow-y-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <TaskAttachmentFields
                  label={`Đính kèm — Lần ${index + 2}`}
                  entityLabel="Task"
                  files={entry.files}
                  pendingFiles={entryPendingFiles[entry.id] ?? []}
                  links={entry.links}
                  images={entry.images}
                  pendingImages={entryPendingImages[entry.id] ?? []}
                  maxFiles={MAX_TASK_FILES}
                  maxLinks={MAX_TASK_LINKS}
                  maxImages={MAX_TASK_IMAGES}
                  submitting={submitting}
                  fileError={entryFileErrors[entry.id]}
                  linkError={entryLinkErrors[entry.id]}
                  imageError={entryImageErrors[entry.id]}
                  onSelectFiles={(files) => handleEntryFileSelection(entry.id, files)}
                  onSelectImages={(files) => handleEntryImageSelection(entry.id, files)}
                  onAddLink={() => updateEntry(entry.id, (current) => ({ ...current, links: [...current.links, { label: "", url: "" }] }))}
                  onUpdateLink={(rowIndex, linkPatch) => updateEntry(entry.id, (current) => ({ ...current, links: current.links.map((link, i) => i === rowIndex ? { ...link, ...linkPatch } : link) }))}
                  onRemoveLink={(rowIndex) => updateEntry(entry.id, (current) => ({ ...current, links: current.links.filter((_, i) => i !== rowIndex) }))}
                  onRemoveSavedFile={(url) => updateEntry(entry.id, (current) => ({ ...current, files: current.files.filter((file) => file.url !== url) }))}
                  onRemovePendingFile={(fileId) => setEntryPendingFiles((current) => ({ ...current, [entry.id]: (current[entry.id] ?? []).filter((file) => file.id !== fileId) }))}
                  onUpdateSavedFile={(url, filePatch) => updateEntry(entry.id, (current) => ({ ...current, files: current.files.map((file) => file.url === url ? { ...file, ...filePatch } : file) }))}
                  onUpdatePendingFile={(fileId, filePatch) => setEntryPendingFiles((current) => ({ ...current, [entry.id]: (current[entry.id] ?? []).map((file) => file.id === fileId ? { ...file, ...filePatch } : file) }))}
                  onRemoveSavedImage={(url) => updateEntry(entry.id, (current) => ({ ...current, images: current.images.filter((image) => image !== url) }))}
                  onRemovePendingImage={(imageId) => removeEntryPendingImage(entry.id, imageId)}
                />
              </div>
            ) : null)}
          </section>

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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Mức độ ưu tiên</label>
              <SingleSelectDropdown
                options={PRIORITY_SELECT_OPTIONS}
                value={form.priority}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, priority: value as FormState["priority"] }))
                }
                showSelectionIndicator={false}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Trạng thái task</label>
              <SingleSelectDropdown
                options={STATUS_SELECT_OPTIONS}
                value={form.status}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, status: value as TaskStatus }))
                }
                disabled={mode !== "edit" || account?.role !== "admin"}
                showSelectionIndicator={false}
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
                min={workTaskStartDate}
                max={workTaskDueDate}
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
                min={workTaskStartDate}
                max={workTaskDueDate}
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
              placeholder="VD: Thi công, Khảo sát..."
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {submitError && <p className="text-sm text-rose-500">{submitError}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          {setPersistent && <RememberDraftToggle checked={persistent} onChange={setPersistent} />}
          <div className="flex items-center gap-3">
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
        </div>
      </form>
    </div>
  );
}
