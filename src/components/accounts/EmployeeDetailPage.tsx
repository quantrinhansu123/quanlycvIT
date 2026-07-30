"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft, BadgeCheck, BriefcaseBusiness, Building2, CalendarDays,
  CircleUserRound, CreditCard, Eye, EyeOff, KeyRound, Landmark, LoaderCircle,
  LockKeyhole, Mail, MapPin, Pencil, Phone, ShieldCheck, UserRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { accountService } from "@/services/account-service";
import type { AccountInput, Department, EmployeeAccount } from "@/types/account";

const AccountFormModal = dynamic(
  () => import("@/components/accounts/AccountFormModal").then((mod) => mod.AccountFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

const ROLE_LABEL = { admin: "Quản trị viên", manager: "Quản lý", member: "Nhân viên" };

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function avatarColor(name: string) {
  const colors = ["#2563eb", "#7c3aed", "#e11d48", "#ea580c", "#059669"];
  return colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
}

export function EmployeeDetailPage({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [account, setAccount] = useState<EmployeeAccount | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"information" | "password">("information");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [employee, directory] = await Promise.all([
        accountService.getById(employeeId),
        accountService.getAll(),
      ]);
      setAccount(employee);
      setDepartments(directory.departments);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể tải hồ sơ nhân viên",
        description: getErrorMessage(error, "Vui lòng quay lại danh sách và thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(input: AccountInput) {
    await accountService.update(employeeId, input);
    setEditing(false);
    notify({ type: "success", title: "Đã cập nhật hồ sơ nhân viên" });
    await load();
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!account?.email) {
      notify({ type: "error", title: "Tài khoản chưa có email đăng nhập" });
      return;
    }
    if (newPassword.length < 6) {
      notify({ type: "error", title: "Mật khẩu mới phải có ít nhất 6 ký tự" });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({ type: "error", title: "Xác nhận mật khẩu mới không khớp" });
      return;
    }
    setChangingPassword(true);
    try {
      await accountService.updatePassword(employeeId, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      notify({ type: "success", title: "Đổi mật khẩu thành công" });
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể đổi mật khẩu",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-gray-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-brand-600" />
        Đang tải hồ sơ...
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <CircleUserRound className="h-12 w-12 text-gray-300" />
        <p className="font-semibold text-gray-700">Không tìm thấy nhân viên</p>
        <Button variant="secondary" onClick={() => router.push("/nhan-vien")}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white pb-20">
      <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/nhan-vien")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-brand-600"
            aria-label="Quay lại danh sách nhân viên"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="truncate text-sm text-gray-600">
            Hồ sơ: <b className="text-gray-800">{account.name}</b>
          </p>
        </div>
        {tab === "information" && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Chỉnh sửa
          </Button>
        )}
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {tab === "information" && (
          <section className="overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-white px-6 py-5 shadow-sm">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="rounded-full bg-white p-1 shadow-sm ring-2 ring-brand-200">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt={account.name} className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <Avatar name={account.name} color={avatarColor(account.name)} size="lg" className="h-20 w-20 text-2xl ring-0" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-gray-950">{account.name}</h1>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="primary" icon={ShieldCheck}>{ROLE_LABEL[account.role]}</Badge>
                  <Badge tone={account.status === "active" ? "success" : "muted"} icon={BadgeCheck}>
                    {account.status === "active" ? "Hoạt động" : "Đã khóa"}
                  </Badge>
                  {account.position && <Badge tone="muted" icon={BriefcaseBusiness}>{account.position}</Badge>}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Mã NV: <b className="font-medium text-gray-700">{account.employeeCode}</b>
                  {account.username && <> · @{account.username}</>}
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "information" ? (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
            <InfoCard title="Thông tin cá nhân">
              <InfoRow icon={UserRound} label="Họ và tên" value={account.name} />
              <InfoRow icon={Mail} label="Email" value={account.email} />
              <InfoRow icon={Phone} label="Số điện thoại" value={account.phone} />
              <InfoRow icon={MapPin} label="Địa chỉ" value={account.address} />
              <InfoRow icon={CalendarDays} label="Ngày sinh" value={formatDate(account.birthDate)} />
            </InfoCard>

            <InfoCard title="Thông tin nhân sự">
              <InfoRow icon={Building2} label="Phòng ban" value={account.department?.name} />
              <InfoRow icon={BriefcaseBusiness} label="Chức vụ" value={account.position} />
              <InfoRow icon={CalendarDays} label="Ngày vào làm" value={formatDate(account.startDate)} />
              <InfoRow icon={CalendarDays} label="Ngày nghỉ việc" value={formatDate(account.endDate)} />
              <InfoRow icon={ShieldCheck} label="Vai trò hệ thống" value={ROLE_LABEL[account.role]} />
            </InfoCard>

            <InfoCard title="Thông tin ngân hàng">
              <InfoRow icon={CreditCard} label="Số tài khoản" value={account.bankAccount} />
              <InfoRow icon={Landmark} label="Ngân hàng" value={account.bankName} />
            </InfoCard>

            <InfoCard title="Thông tin tài khoản">
              <InfoRow icon={CircleUserRound} label="Tên đăng nhập" value={account.username} />
              <InfoRow icon={Mail} label="Email đăng nhập" value={account.email} />
              <InfoRow icon={CalendarDays} label="Ngày tạo" value={formatDate(account.createdAt)} />
            </InfoCard>

            {account.note && (
              <div className="lg:col-span-2">
                <InfoCard title="Ghi chú">
                  <p className="text-sm leading-6 text-gray-600">{account.note}</p>
                </InfoCard>
              </div>
            )}
          </div>
        ) : (
          <section className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Đổi mật khẩu</h2>
                <p className="mt-0.5 text-sm text-gray-500">Đặt mật khẩu đăng nhập mới cho nhân viên</p>
              </div>
            </div>

            <form className="mt-8 space-y-4" onSubmit={(event) => void changePassword(event)}>
              <PasswordField
                label="Mật khẩu mới"
                value={newPassword}
                onChange={setNewPassword}
                visible={showNewPassword}
                onToggle={() => setShowNewPassword((visible) => !visible)}
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
              />
              <PasswordField
                label="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((visible) => !visible)}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
              />
              <Button type="submit" className="mt-3" disabled={changingPassword || !account.email}>
                {changingPassword ? "Đang đổi..." : "Đổi mật khẩu"}
              </Button>
            </form>
          </section>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur lg:left-[264px]">
        <div className="mx-auto flex max-w-5xl gap-2 rounded-xl bg-gray-50 p-1">
          <BottomTab active={tab === "information"} onClick={() => setTab("information")} icon={CircleUserRound}>
            Thông tin
          </BottomTab>
          <BottomTab active={tab === "password"} onClick={() => setTab("password")} icon={KeyRound}>
            Đổi mật khẩu
          </BottomTab>
        </div>
      </div>

      {editing && (
        <AccountFormModal
          account={account}
          departments={departments}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

function Badge({ children, icon: Icon, tone }: { children: React.ReactNode; icon: React.ElementType; tone: "primary" | "success" | "muted" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
      tone === "primary" && "border-brand-600 bg-brand-600 text-white",
      tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
      tone === "muted" && "border-gray-200 bg-white text-gray-700"
    )}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </span>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-sm font-bold text-gray-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-gray-900">{value || "—"}</p>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: "new-password";
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-900">
        {label} <span aria-hidden="true">*</span>
      </span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={autoComplete === "new-password" ? 6 : undefined}
          required
          className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 pr-11 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function BottomTab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition",
        active ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-800"
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}
