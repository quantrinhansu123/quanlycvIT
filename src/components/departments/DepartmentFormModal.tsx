"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  DepartmentInput,
  DepartmentPosition,
  DepartmentRecord,
} from "@/types/department";

interface Props {
  department?: DepartmentRecord;
  departments: DepartmentRecord[];
  onClose: () => void;
  onSave: (input: DepartmentInput) => Promise<void>;
}

function newPosition(): DepartmentPosition {
  return {
    id: crypto.randomUUID(),
    name: "",
    level: 1,
  };
}

function fromDepartment(department?: DepartmentRecord): DepartmentInput {
  if (!department) {
    return {
      code: "",
      name: "",
      level: 1,
      positions: [],
      positionStructure: [newPosition()],
      status: "active",
    };
  }
  return {
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    level: department.level,
    positions: department.positions,
    positionStructure:
      department.positionStructure.length > 0
        ? department.positionStructure.map((position) => ({ ...position }))
        : [newPosition()],
    description: department.description,
    status: department.status,
  };
}

export function DepartmentFormModal({
  department,
  departments,
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<DepartmentInput>(() => fromDepartment(department));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  function updatePosition(id: string, patch: Partial<DepartmentPosition>) {
    setForm((current) => ({
      ...current,
      positionStructure: current.positionStructure.map((position) =>
        position.id === id ? { ...position, ...patch } : position
      ),
    }));
  }

  function removePosition(id: string) {
    setForm((current) => ({
      ...current,
      positionStructure: current.positionStructure
        .filter((position) => position.id !== id)
        .map((position) => position.managerId === id
          ? { ...position, managerId: undefined }
          : position),
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const positionStructure = form.positionStructure
      .map((position) => ({ ...position, name: position.name.trim() }))
      .filter((position) => position.name);

    if (!form.code.trim() || !form.name.trim()) {
      setError("Vui lòng nhập tên và mã phòng ban.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        ...form,
        positions: positionStructure.map((position) => position.name),
        positionStructure,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu phòng ban.");
      setSaving(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const availableParents = departments.filter((item) => item.id !== department?.id);

  return (
    <div
      className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <form
        onSubmit={submit}
        className="account-dialog flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <h2 className="text-xl font-bold text-gray-900">
            {department ? "Chỉnh sửa phòng ban" : "Thêm phòng ban"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          <Field label="Tên phòng ban *">
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className={inputClass}
              placeholder="Ví dụ: Phòng Kỹ thuật"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trực thuộc (Phòng cha)">
              <select
                value={form.parentId ?? ""}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  parentId: event.target.value || undefined,
                }))}
                className={inputClass}
              >
                <option value="">-- Không trực thuộc --</option>
                {availableParents.map((parent) => (
                  <option key={parent.id} value={parent.id}>{parent.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Cấp độ ưu tiên">
              <input
                type="number"
                min={1}
                value={form.level}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  level: Number(event.target.value) || 1,
                }))}
                className={`${inputClass} text-right`}
                placeholder="Ví dụ: 1"
              />
            </Field>
          </div>

          <Field label="Mã phòng ban">
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              className={inputClass}
              placeholder="Ví dụ: PB-KT"
              required
            />
          </Field>

          <Field label="Mô tả">
            <textarea
              value={form.description ?? ""}
              onChange={(event) => setForm((current) => ({
                ...current,
                description: event.target.value,
              }))}
              rows={3}
              placeholder="Ví dụ: Phụ trách triển khai kỹ thuật và công nghệ"
              className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          <section className="rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Cấu trúc chức vụ</h3>
                <p className="mt-1 text-xs text-gray-500">Cấp bậc 1 là cao nhất</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                onClick={() => setForm((current) => ({
                  ...current,
                  positionStructure: [...current.positionStructure, newPosition()],
                }))}
              >
                <Plus className="h-4 w-4" /> Thêm chức vụ
              </Button>
            </div>

            <div className="mt-5 space-y-2">
              {form.positionStructure.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                  Chưa có chức vụ. Bấm “Thêm chức vụ” để bắt đầu.
                </div>
              ) : (
                form.positionStructure.map((position) => (
                  <div
                    key={position.id}
                    className="grid items-center gap-2 rounded-xl border border-gray-200 p-2 sm:grid-cols-[minmax(220px,1fr)_94px_minmax(220px,1fr)_42px]"
                  >
                    <input
                      value={position.name}
                      onChange={(event) => updatePosition(position.id, { name: event.target.value })}
                      placeholder="Tên chức vụ (GĐ, TP, NV...)"
                      className={inputClass}
                    />
                    <input
                      type="number"
                      min={1}
                      value={position.level}
                      onChange={(event) => updatePosition(position.id, {
                        level: Number(event.target.value) || 1,
                      })}
                      aria-label={`Cấp bậc ${position.name || "chức vụ"}`}
                      className={`${inputClass} text-center`}
                      placeholder="Cấp bậc"
                    />
                    <select
                      value={position.managerId ?? ""}
                      onChange={(event) => updatePosition(position.id, {
                        managerId: event.target.value || undefined,
                      })}
                      aria-label={`Chức vụ quản lý ${position.name || "chức vụ"}`}
                      className={inputClass}
                    >
                      <option value="">-- Không quản lý --</option>
                      {form.positionStructure
                        .filter((candidate) => candidate.id !== position.id && candidate.name.trim())
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removePosition(position.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50"
                      aria-label={`Xóa chức vụ ${position.name || ""}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <span className="text-sm font-medium text-gray-900">Trạng thái hoạt động</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.status === "active"}
              onClick={() => setForm((current) => ({
                ...current,
                status: current.status === "active" ? "inactive" : "active",
              }))}
              className={cnSwitch(form.status === "active")}
            >
              <span className={form.status === "active" ? "translate-x-5" : "translate-x-0"} />
            </button>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-gray-200 px-4 py-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : department ? "Cập nhật" : "Thêm mới"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-900">{label}</span>
      {children}
    </label>
  );
}

function cnSwitch(active: boolean) {
  return [
    "relative h-6 w-11 rounded-full p-0.5 transition-colors",
    active ? "bg-blue-600" : "bg-gray-300",
    "[&>span]:block [&>span]:h-5 [&>span]:w-5 [&>span]:rounded-full [&>span]:bg-white [&>span]:shadow-sm [&>span]:transition-transform",
  ].join(" ");
}
