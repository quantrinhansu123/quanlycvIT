"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { WorkTask, WorkTaskInput } from "@/types/task";
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

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    const input: WorkTaskInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      projectId: form.projectId,
      assigneeIds: form.assigneeIds,
      status: form.status,
      priority: form.priority,
      startDate: form.startDate,
      dueDate: form.dueDate,
      progress: task?.progress ?? 0,
      tags: form.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      dependsOnTaskId: form.dependsOnTaskId || undefined,
    };

    try {
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
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Chi tiết yêu cầu công việc..."
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
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
