"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Project, ProjectColor, ProjectInput, ProjectMember, ProjectStepConfig } from "@/types/project";
import { DEFAULT_PROJECT_STEPS, PROJECT_COLORS } from "@/types/project";
import { projectService, generateProjectCode } from "@/services/project-service";
import { toDateInputValue, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

interface ProjectFormModalProps {
  mode: "create" | "edit";
  project?: Project;
  members: ProjectMember[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  code: string;
  color: ProjectColor;
  steps: ProjectStepConfig[];
  description: string;
  startDate: string;
  endDate: string;
  managerIds: string[];
  memberIds: string[];
}

function buildInitialState(project: Project | undefined, members: ProjectMember[]): FormState {
  if (project) {
    const managerIds = project.managers.length > 0
      ? project.managers.map((manager) => manager.id)
      : project.manager.id
        ? [project.manager.id]
        : [];
    return {
      name: project.name,
      code: project.code,
      color: project.color,
      steps: project.steps,
      description: project.description ?? "",
      startDate: toDateInputValue(project.startDate),
      endDate: toDateInputValue(project.endDate),
      managerIds,
      memberIds: project.members
        .map((member) => member.id)
        .filter((memberId) => !managerIds.includes(memberId)),
    };
  }
  return {
    name: "",
    code: "",
    color: "purple",
    steps: DEFAULT_PROJECT_STEPS,
    description: "",
    startDate: toDateInputValue(new Date().toISOString()),
    endDate: "",
    managerIds: members[0] ? [members[0].id] : [],
    memberIds: [],
  };
}

export function ProjectFormModal({ mode, project, members, onClose, onSaved }: ProjectFormModalProps) {
  const { notify } = useFeedback();
  const [form, setForm] = useState<FormState>(() => buildInitialState(project, members));
  const [codeTouched, setCodeTouched] = useState(mode === "edit");
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [managerSearch, setManagerSearch] = useState("");
  const managerPickerRef = useRef<HTMLDivElement>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const memberPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || submitting) return;
      if (memberPickerOpen) {
        setMemberPickerOpen(false);
        setMemberSearch("");
      } else if (managerPickerOpen) {
        setManagerPickerOpen(false);
        setManagerSearch("");
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [managerPickerOpen, memberPickerOpen, onClose, submitting]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        managerPickerRef.current &&
        !managerPickerRef.current.contains(event.target as Node)
      ) {
        setManagerPickerOpen(false);
        setManagerSearch("");
      }
      if (
        memberPickerRef.current &&
        !memberPickerRef.current.contains(event.target as Node)
      ) {
        setMemberPickerOpen(false);
        setMemberSearch("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectedMembers: ProjectMember[] = useMemo(
    () => form.memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean) as ProjectMember[],
    [form.memberIds, members]
  );
  const selectedManagers = useMemo(
    () =>
      form.managerIds
        .map((id) => members.find((member) => member.id === id))
        .filter((member): member is ProjectMember => Boolean(member)),
    [form.managerIds, members]
  );
  const filteredManagers = useMemo(() => {
    const keyword = managerSearch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!keyword) return members;
    return members.filter((member) =>
      [member.name, member.role, member.email]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(keyword)
    );
  }, [managerSearch, members]);
  const filteredMembers = useMemo(() => {
    const keyword = memberSearch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return members.filter((member) => {
      if (form.managerIds.includes(member.id)) return false;
      if (!keyword) return true;
      return [member.name, member.role, member.email]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(keyword);
    });
  }, [form.managerIds, memberSearch, members]);

  function handleNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      code: codeTouched ? prev.code : generateProjectCode(value),
    }));
  }

  function toggleStep(key: ProjectStepConfig["key"]) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.key === key ? { ...step, enabled: !step.enabled } : step)),
    }));
  }

  function toggleMember(id: string) {
    setForm((prev) => {
      if (prev.managerIds.includes(id)) return prev;
      return {
        ...prev,
        memberIds: prev.memberIds.includes(id)
          ? prev.memberIds.filter((memberId) => memberId !== id)
          : [...prev.memberIds, id],
      };
    });
  }

  function toggleManager(id: string) {
    setForm((prev) => {
      const selected = prev.managerIds.includes(id);
      return {
        ...prev,
        managerIds: selected
          ? prev.managerIds.filter((managerId) => managerId !== id)
          : [...prev.managerIds, id],
        // Một người quản lý không đồng thời nằm trong danh sách thành viên.
        memberIds: selected
          ? prev.memberIds
          : prev.memberIds.filter((memberId) => memberId !== id),
      };
    });
    setErrors((prev) => ({ ...prev, managerIds: undefined }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) nextErrors.name = "Vui lòng nhập tên dự án";
    if (!form.code.trim()) nextErrors.code = "Vui lòng nhập mã dự án";
    if (!form.startDate) nextErrors.startDate = "Vui lòng chọn ngày bắt đầu";
    if (!form.endDate) nextErrors.endDate = "Vui lòng chọn ngày kết thúc";
    if (form.managerIds.length === 0) {
      nextErrors.managerIds = "Chọn ít nhất một người quản lý";
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
    }
    if (!form.steps.some((step) => step.enabled)) {
      nextErrors.steps = "Chọn ít nhất một bước trạng thái";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    const input: ProjectInput = {
      name: form.name.trim(),
      code: form.code.trim(),
      color: form.color,
      steps: form.steps,
      description: form.description.trim() || undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      managerIds: form.managerIds,
      memberIds: form.memberIds.filter(
        (memberId) => !form.managerIds.includes(memberId)
      ),
    };

    try {
      if (mode === "edit" && project) {
        await projectService.updateProject(project.id, input);
      } else {
        await projectService.createProject(input);
      }
      notify({
        type: "success",
        title: mode === "edit" ? "Đã cập nhật dự án" : "Đã tạo dự án",
        description: `Dự án “${input.name}” đã được lưu thành công.`,
      });
      onSaved();
    } catch (error) {
      const message = getErrorMessage(error, "Không thể lưu dự án. Vui lòng thử lại.");
      setSubmitError(message);
      notify({ type: "error", title: "Lưu dự án thất bại", description: message });
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
          <h2 className="text-lg font-bold text-gray-900">
            {mode === "edit" ? "Chỉnh sửa dự án" : "Thêm dự án mới"}
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
          {members.length === 0 && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Chưa có nhân sự đang hoạt động trong Supabase. Hãy thêm dữ liệu vào bảng{" "}
              <code className="font-semibold">tai_khoan</code> trước khi tạo dự án.
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Tên dự án <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="VD: Hệ thống CRM bán hàng, Website công ty..."
              className={cn(
                "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                errors.name ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
              )}
            />
            {errors.name && <p className="mt-1 text-xs text-rose-500">{errors.name}</p>}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Mã dự án <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(event) => {
                  setCodeTouched(true);
                  setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }));
                }}
                placeholder="Tự động sinh từ tên..."
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                  errors.code ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
                )}
              />
              {errors.code && <p className="mt-1 text-xs text-rose-500">{errors.code}</p>}
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Hộp màu đại diện</span>
              <div className="flex h-10 items-center gap-2">
                {PROJECT_COLORS.map(({ value, hex }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, color: value }))}
                    className={cn(
                      "h-5 w-5 rounded-full ring-2 ring-offset-2 transition-shadow",
                      form.color === value ? "ring-gray-400" : "ring-transparent"
                    )}
                    style={{ backgroundColor: hex }}
                    aria-label={`Màu ${value}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Cấu hình các bước (trạng thái công việc) <span className="text-rose-500">*</span>
            </span>
            <p className="mb-2 text-xs text-gray-400">Lựa chọn các bước trạng thái được kích hoạt trong dự án này</p>
            <div className="grid grid-cols-2 gap-2">
              {form.steps.map((step) => (
                <label
                  key={step.key}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={() => toggleStep(step.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {step.label}
                </label>
              ))}
            </div>
            {errors.steps && <p className="mt-1 text-xs text-rose-500">{errors.steps}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Mô tả dự án</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Chi tiết yêu cầu dự án..."
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                Ngày kết thúc <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className={cn(
                  "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100",
                  errors.endDate ? "border-rose-400" : "border-gray-200 focus:border-blue-400"
                )}
              />
              {errors.endDate && <p className="mt-1 text-xs text-rose-500">{errors.endDate}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Người quản lý (PM) <span className="text-rose-500">*</span>
            </label>
            <div ref={managerPickerRef} className="relative">
              <div
                className={cn(
                  "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-shadow",
                  errors.managerIds
                    ? "border-rose-400"
                    : managerPickerOpen
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : "border-gray-200"
                )}
              >
                {selectedManagers.map((manager) => (
                  <span
                    key={manager.id}
                    className="flex max-w-full items-center gap-1.5 rounded-md bg-blue-50 py-1 pl-1.5 pr-1 text-xs font-medium text-blue-700"
                  >
                    <Avatar name={manager.name} color={manager.avatarColor} size="sm" />
                    <span className="truncate">{manager.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleManager(manager.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-blue-400 hover:bg-blue-100 hover:text-blue-700"
                      aria-label={`Bỏ chọn quản lý ${manager.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMemberPickerOpen(false);
                    setMemberSearch("");
                    setManagerPickerOpen((open) => !open);
                  }}
                  className="flex min-h-7 min-w-[150px] flex-1 items-center justify-between gap-2 px-1.5 text-left text-sm text-gray-500"
                  aria-expanded={managerPickerOpen}
                  aria-haspopup="listbox"
                >
                  <span>
                    {selectedManagers.length === 0
                      ? "Chọn người quản lý..."
                      : "Thêm người quản lý..."}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      managerPickerOpen && "rotate-180"
                    )}
                  />
                </button>
              </div>

              {managerPickerOpen && (
                <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <div className="relative border-b border-gray-100 p-2">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={managerSearch}
                      onChange={(event) => setManagerSearch(event.target.value)}
                      placeholder="Nhập tên, chức vụ hoặc email..."
                      autoFocus
                      className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true">
                    {filteredManagers.map((manager) => {
                      const selected = form.managerIds.includes(manager.id);
                      return (
                        <button
                          key={manager.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleManager(manager.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                            selected && "bg-blue-50 hover:bg-blue-50"
                          )}
                        >
                          <Avatar name={manager.name} color={manager.avatarColor} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-700">
                              {manager.name}
                            </span>
                            <span className="block truncate text-xs text-gray-400">
                              {[manager.role, manager.email].filter(Boolean).join(" · ") || "Nhân sự"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              selected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-gray-300 text-transparent"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      );
                    })}
                    {filteredManagers.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-gray-400">
                        Không tìm thấy nhân sự phù hợp
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Có thể chọn nhiều người; người được chọn đầu tiên là quản lý chính.
            </p>
            {errors.managerIds && <p className="mt-1 text-xs text-rose-500">{errors.managerIds}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Thành viên tham gia</label>
            <div ref={memberPickerRef} className="relative">
              <div
                className={cn(
                  "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-shadow",
                  memberPickerOpen
                    ? "border-blue-400 ring-2 ring-blue-100"
                    : "border-gray-200"
                )}
              >
                {selectedMembers.map((member) => (
                  <span
                    key={member.id}
                    className="flex max-w-full items-center gap-1.5 rounded-md bg-gray-100 py-1 pl-1.5 pr-1 text-xs font-medium text-gray-700"
                  >
                    <Avatar name={member.name} color={member.avatarColor} size="sm" />
                    <span className="truncate">{member.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                      aria-label={`Bỏ chọn thành viên ${member.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setManagerPickerOpen(false);
                    setManagerSearch("");
                    setMemberPickerOpen((open) => !open);
                  }}
                  className="flex min-h-7 min-w-[150px] flex-1 items-center justify-between gap-2 px-1.5 text-left text-sm text-gray-500"
                  aria-expanded={memberPickerOpen}
                  aria-haspopup="listbox"
                >
                  <span>
                    {selectedMembers.length === 0
                      ? "Chọn thành viên..."
                      : "Thêm thành viên..."}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      memberPickerOpen && "rotate-180"
                    )}
                  />
                </button>
              </div>

              {memberPickerOpen && (
                <div className="absolute bottom-full z-30 mb-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <div className="relative border-b border-gray-100 p-2">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Nhập tên, chức vụ hoặc email..."
                      autoFocus
                      className="h-9 w-full rounded-lg bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true">
                    {filteredMembers.map((member) => {
                      const selected = form.memberIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleMember(member.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50",
                            selected && "bg-blue-50 hover:bg-blue-50"
                          )}
                        >
                          <Avatar name={member.name} color={member.avatarColor} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-700">
                              {member.name}
                            </span>
                            <span className="block truncate text-xs text-gray-400">
                              {[member.role, member.email].filter(Boolean).join(" · ") || "Nhân sự"}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              selected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-gray-300 text-transparent"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      );
                    })}
                    {filteredMembers.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-gray-400">
                        Không còn nhân sự phù hợp để chọn
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Người đã được chọn làm quản lý sẽ không xuất hiện trong danh sách này.
            </p>
          </div>

          {submitError && <p className="text-sm text-rose-500">{submitError}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitting || members.length === 0}>
            {submitting ? "Đang lưu..." : members.length === 0 ? "Chưa có nhân sự" : mode === "edit" ? "Cập nhật" : "Tạo mới"}
          </Button>
        </div>
      </form>
    </div>
  );
}
