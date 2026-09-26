"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Building2, ImageUp, Landmark, LoaderCircle, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BankCombobox } from "@/components/accounts/BankCombobox";
import { cn } from "@/lib/utils";
import type {
  AccountInput,
  Department,
  EmployeeAccount,
} from "@/types/account";

interface Props {
  account?: EmployeeAccount;
  departments: Department[];
  onClose: () => void;
  onSave: (input: AccountInput) => Promise<void>;
}

const emptyForm: AccountInput = {
  employeeCode: "",
  name: "",
  role: "member",
  status: "active",
};

function fromAccount(account?: EmployeeAccount): AccountInput {
  if (!account) return emptyForm;
  return {
    employeeCode: account.employeeCode,
    name: account.name,
    phone: account.phone,
    address: account.address,
    avatarUrl: account.avatarUrl,
    birthDate: account.birthDate,
    startDate: account.startDate,
    endDate: account.endDate,
    bankAccount: account.bankAccount,
    bankName: account.bankName,
    note: account.note,
    username: account.username,
    email: account.email,
    departmentId: account.departmentId,
    position: account.position,
    role: account.role,
    status: account.status,
  };
}

export function AccountFormModal({ account, departments, onClose, onSave }: Props) {
  const [form, setForm] = useState<AccountInput>(() => fromAccount(account));
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [error, setError] = useState("");
  const positions = useMemo(() => {
    const selected = departments.find((item) => item.id === form.departmentId);
    const values = [...new Map(
      (selected?.positions ?? [])
        .map((position) => position.trim())
        .filter(Boolean)
        .map((position) => [position.toLocaleLowerCase("vi"), position])
    ).values()];
    const currentPosition = form.position?.trim();
    return currentPosition && !values.some(
      (position) => position.toLocaleLowerCase("vi") === currentPosition.toLocaleLowerCase("vi")
    )
      ? [currentPosition, ...values]
      : values;
  }, [departments, form.departmentId, form.position]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);

  function set<K extends keyof AccountInput>(key: K, value: AccountInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;

    setAvatarError("");
    setUploadingAvatar(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/media/avatar", { method: "POST", body });
      const payload = await response.json() as {
        success?: boolean;
        message?: string;
        data?: { url?: string };
      };
      if (!response.ok || !payload.success || !payload.data?.url) {
        throw new Error(payload.message ?? "Không thể tải ảnh lên.");
      }
      set("avatarUrl", payload.data.url);
    } catch (reason) {
      setAvatarError(reason instanceof Error ? reason.message : "Không thể tải ảnh lên.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.employeeCode.trim() || !form.name.trim()) {
      setError("Vui lòng nhập mã nhân viên và họ tên.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu tài khoản.");
      setSaving(false);
    }
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 account-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl account-dialog"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {account ? "Chỉnh sửa tài khoản" : "Thêm tài khoản mới"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Hồ sơ nhân viên và thông tin đăng nhập hệ thống
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <UserRound className="h-4 w-4 text-brand-600" /> Thông tin cơ bản
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mã nhân viên" required>
                <input className={inputClass} value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value.toUpperCase())} placeholder="VD: NV001" />
              </Field>
              <Field label="Họ và tên" required>
                <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nhập họ và tên" />
              </Field>
              <Field label="Email">
                <input type="email" className={inputClass} value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="email@company.com" />
              </Field>
              <Field label="Tên đăng nhập">
                <input className={inputClass} value={form.username ?? ""} onChange={(e) => set("username", e.target.value)} placeholder="VD: nguyenvana" />
              </Field>
              <Field label="Số điện thoại">
                <input className={inputClass} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="Nhập số điện thoại" />
              </Field>
              <Field label="Ảnh đại diện">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {form.avatarUrl ? (
                      <Image
                        src={form.avatarUrl}
                        alt="Ảnh đại diện xem trước"
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">AV</div>
                    )}
                    <label className={cn("flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50", uploadingAvatar && "cursor-wait opacity-60")}>
                      {uploadingAvatar ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                      {uploadingAvatar ? "Đang tải..." : "Tải ảnh lên"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="sr-only"
                        disabled={uploadingAvatar}
                        onChange={(event) => {
                          void uploadAvatar(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-500">Hỗ trợ JPG, PNG, WEBP, AVIF; tối đa 5 MB.</p>
                  {avatarError && <p role="alert" className="text-xs text-rose-600">{avatarError}</p>}
                </div>
              </Field>
              <Field label="Ngày sinh">
                <input type="date" className={inputClass} value={form.birthDate ?? ""} onChange={(e) => set("birthDate", e.target.value)} />
              </Field>
              <Field label="Địa chỉ">
                <input className={inputClass} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Nhập địa chỉ" />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Building2 className="h-4 w-4 text-brand-600" /> Công việc & phân quyền
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phòng ban">
                <select className={inputClass} value={form.departmentId ?? ""} onChange={(e) => setForm((current) => ({ ...current, departmentId: e.target.value || undefined, position: undefined }))}>
                  <option value="">Chọn phòng ban</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </Field>
              <Field label="Chức vụ">
                <>
                  <input
                    className={inputClass}
                    list="account-position-options"
                    value={form.position ?? ""}
                    onChange={(e) => set("position", e.target.value)}
                    placeholder="Nhập mới hoặc chọn chức vụ"
                  />
                  <datalist id="account-position-options">
                    {positions.map((position) => <option key={position} value={position} />)}
                  </datalist>
                </>
              </Field>
              <Field label="Vai trò hệ thống">
                <select className={inputClass} value={form.role} onChange={(e) => set("role", e.target.value as AccountInput["role"])}>
                  <option value="member">Nhân viên</option>
                  <option value="manager">Quản lý</option>
                  <option value="admin">Quản trị</option>
                </select>
              </Field>
              <Field label="Trạng thái">
                <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value as AccountInput["status"])}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Đã khóa</option>
                </select>
              </Field>
              <Field label="Ngày vào làm">
                <input type="date" className={inputClass} value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
              <Field label="Ngày nghỉ việc">
                <input type="date" className={inputClass} value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Landmark className="h-4 w-4 text-brand-600" /> Ngân hàng & ghi chú
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Số tài khoản">
                <input className={inputClass} value={form.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
              </Field>
              <Field label="Ngân hàng">
                <BankCombobox value={form.bankName ?? ""} onChange={(value) => set("bankName", value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Ghi chú">
                  <textarea className={cn(inputClass, "h-20 resize-none py-2")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Mật khẩu được quản lý an toàn bởi Supabase Auth và không lưu trong hồ sơ nhân viên.
          </p>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : account ? "Cập nhật" : "Thêm mới"}</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
