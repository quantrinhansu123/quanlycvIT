"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Subtask, SubtaskInput } from "@/types/subtask";
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
  };
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
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    const input: SubtaskInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
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
    };

    try {
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
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-gray-900/40"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />

      <form
        onSubmit={handleSubmit}
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:max-w-lg"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{mode === "edit" ? "Chỉnh sửa task" : "Thêm task mới"}</h2>
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
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Chi tiết yêu cầu task..."
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Thuộc công việc <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.workTaskId}
              onChange={(event) => handleWorkTaskChange(event.target.value)}
              className={cn(
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                errors.workTaskId ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
              )}
            >
              <option value="" disabled>
                Chọn công việc trước
              </option>
              {workTasks.map((workTask) => (
                <option key={workTask.id} value={workTask.id}>
                  {workTask.title}
                </option>
              ))}
            </select>
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

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
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
