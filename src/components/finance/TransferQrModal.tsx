"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SingleSelectDropdown } from "@/components/ui/SingleSelectDropdown";
import { apiClient } from "@/services/api-client";
import { getErrorMessage } from "@/lib/errors";
import { cn, getAppDateKey } from "@/lib/utils";
import type { FinanceCategory, FinanceInput, FinanceTransferRecipient } from "@/types/finance";

interface Props {
  categories: FinanceCategory[];
  onClose: () => void;
  /** Ghi nhận khoản chi tương ứng sau khi người dùng xác nhận đã chuyển khoản thành công. */
  onConfirm: (input: FinanceInput) => Promise<void>;
}

interface VietQrBank {
  code: string;
  shortName: string;
}

const integerFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function formatMoneyInput(value: number) {
  return value ? integerFormatter.format(value) : "";
}

/** Ảnh QR tĩnh dựng bởi img.vietqr.io cần mã BIN ngân hàng (VD 970422), trong khi
 * `tai_khoan.ten_ngan_hang` chỉ lưu tên rút gọn (VD "MBBank") do `BankCombobox`
 * chọn — nên phải tra lại BIN từ danh sách ngân hàng `/api/banks` theo tên rút gọn. */
function findBankBin(banks: VietQrBank[], bankName: string): string | undefined {
  const normalized = bankName.trim().toLocaleLowerCase("vi");
  return banks.find((bank) => bank.shortName.trim().toLocaleLowerCase("vi") === normalized)?.code;
}

export function TransferQrModal({ categories, onClose, onConfirm }: Props) {
  const expenseCategories = useMemo(() => categories.filter((item) => item.type === "chi"), [categories]);
  const [recipients, setRecipients] = useState<FinanceTransferRecipient[]>([]);
  const [banks, setBanks] = useState<VietQrBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState(0);
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState(() => expenseCategories[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiClient.get<FinanceTransferRecipient[]>("/thu-chi/nguoi-nhan", { signal: controller.signal }),
      apiClient.get<VietQrBank[]>("/banks", { signal: controller.signal }),
    ])
      .then(([recipientList, bankList]) => {
        setRecipients(recipientList);
        setBanks(bankList);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(getErrorMessage(error, "Không thể tải danh sách người nhận."));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  const recipient = useMemo(() => recipients.find((item) => item.id === recipientId), [recipients, recipientId]);
  const bankBin = recipient ? findBankBin(banks, recipient.bankName) : undefined;

  function selectRecipient(nextId: string) {
    setRecipientId(nextId);
    const next = recipients.find((item) => item.id === nextId);
    if (next) setContent(`CK cho ${next.name}`);
  }

  const qrUrl = useMemo(() => {
    if (!recipient || !bankBin || amount <= 0) return undefined;
    const params = new URLSearchParams({ amount: String(amount), accountName: recipient.name });
    if (content.trim()) params.set("addInfo", content.trim());
    return `https://img.vietqr.io/image/${bankBin}-${recipient.bankAccount}-compact2.png?${params}`;
  }, [amount, bankBin, content, recipient]);

  async function handleConfirmTransfer() {
    if (!recipient || amount <= 0 || !categoryId) return;
    setConfirming(true);
    setConfirmError("");
    try {
      await onConfirm({
        type: "chi",
        amount,
        date: getAppDateKey(),
        categoryId,
        description: content.trim() || `Chuyển khoản cho ${recipient.name}`,
      });
      setConfirmed(true);
    } catch (error) {
      setConfirmError(getErrorMessage(error, "Không thể ghi nhận khoản chi. Vui lòng thử lại."));
    } finally {
      setConfirming(false);
    }
  }

  const inputClass = "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition hover:border-gray-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="account-dialog flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" aria-labelledby="transfer-qr-title">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="transfer-qr-title" className="text-lg font-bold text-gray-900">Chuyển khoản ngân hàng</h2>
            <p className="mt-1 text-xs text-gray-500">Tạo mã QR VietQR để chuyển khoản cho nhân viên</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {loadError ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{loadError}</p>
          ) : (
            <>
              <Field label="Người nhận" required>
                <SingleSelectDropdown
                  value={recipientId}
                  onChange={selectRecipient}
                  placeholder={loading ? "Đang tải danh sách..." : "Chọn người nhận"}
                  emptyHint="Chưa có nhân viên nào khai báo số tài khoản"
                  disabled={loading || confirmed}
                  searchable
                  searchPlaceholder="Tìm theo tên..."
                  options={recipients.map((item) => ({
                    value: item.id,
                    label: item.name,
                    sublabel: `${item.bankName} · ${item.bankAccount}`,
                  }))}
                />
              </Field>

              {recipient && (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm"><Landmark className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{recipient.bankAccount} · {recipient.bankName}</p>
                    <p className="truncate text-xs text-gray-500">Chủ tài khoản: {recipient.name}</p>
                  </div>
                </div>
              )}
              {recipient && !bankBin && (
                <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Không xác định được mã ngân hàng “{recipient.bankName}” để tạo QR. Vui lòng cập nhật lại ngân hàng trong hồ sơ nhân viên.
                </p>
              )}

              <Field label="Số tiền" required>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    disabled={confirmed}
                    className={cn(inputClass, "pr-14 text-base font-semibold disabled:bg-gray-50")}
                    value={formatMoneyInput(amount)}
                    onChange={(event) => setAmount(Number(event.target.value.replace(/\D/g, "")))}
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">VNĐ</span>
                </div>
              </Field>

              <Field label="Nội dung chuyển khoản">
                <input className={cn(inputClass, "disabled:bg-gray-50")} disabled={confirmed} maxLength={200} value={content} onChange={(event) => setContent(event.target.value)} placeholder="VD: CK lương tháng 8" />
              </Field>

              <Field label="Danh mục chi (khi xác nhận đã chuyển)" required>
                <SingleSelectDropdown
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Chọn danh mục chi"
                  emptyHint="Chưa có danh mục chi, vào “Danh mục” để thêm"
                  disabled={confirmed}
                  searchable
                  searchPlaceholder="Tìm danh mục..."
                  options={expenseCategories.map((item) => ({ value: item.id, label: item.name }))}
                />
              </Field>

              {loading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400"><LoaderCircle className="h-4 w-4 animate-spin" />Đang tải danh sách người nhận...</div>
              )}

              {qrUrl && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- kích thước ảnh QR thay đổi theo template VietQR, không phù hợp next/image */}
                  <img src={qrUrl} alt={`Mã QR chuyển khoản ${recipient?.bankAccount}`} className="h-auto w-64 max-w-full rounded-lg shadow-sm" />
                  <p className="text-xs text-gray-500">Quét mã bằng ứng dụng ngân hàng để chuyển khoản</p>
                </div>
              )}
              {recipient && bankBin && amount <= 0 && (
                <p className="text-center text-xs text-gray-400">Nhập số tiền để hiển thị mã QR.</p>
              )}

              {confirmError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{confirmError}</p>}
              {confirmed && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  Đã ghi nhận khoản chi {money.format(amount)} cho {recipient?.name}.
                </p>
              )}
            </>
          )}
        </div>

        {!loadError && qrUrl && (
          <footer className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
            <Button type="button" variant="secondary" onClick={onClose}>{confirmed ? "Đóng" : "Hủy"}</Button>
            {!confirmed && (
              <Button type="button" onClick={() => void handleConfirmTransfer()} disabled={confirming || !categoryId}>
                {confirming && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {confirming ? "Đang ghi nhận..." : "Xác nhận đã chuyển khoản"}
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-600">{label} {required && <span className="text-rose-500">*</span>}</span>{children}</label>;
}
