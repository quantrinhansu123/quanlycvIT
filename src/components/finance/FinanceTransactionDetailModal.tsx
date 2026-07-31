"use client";

import { useEffect } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, Pencil, ReceiptText, Tags, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DetailAttachments } from "@/components/tasks/DetailAttachments";
import { cn } from "@/lib/utils";
import type { FinanceTransaction } from "@/types/finance";

interface Props {
  transaction: FinanceTransaction;
  onClose: () => void;
  onEdit: () => void;
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export function FinanceTransactionDetailModal({ transaction, onClose, onEdit }: Props) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  const isIncome = transaction.type === "thu";
  const TypeIcon = isIncome ? ArrowUpCircle : ArrowDownCircle;

  return (
    <div className="account-overlay fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="finance-detail-title" className="account-dialog flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="finance-detail-title" className="text-lg font-bold text-gray-900">Chi tiết giao dịch</h2>
            <p className="mt-1 text-xs text-gray-500">Thông tin khoản {isIncome ? "thu" : "chi"} và chứng từ đi kèm</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailItem icon={TypeIcon} label="Loại giao dịch">
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", isIncome ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{isIncome ? "Khoản thu" : "Khoản chi"}</span>
            </DetailItem>
            <DetailItem icon={CalendarDays} label="Ngày giao dịch">{dateFormatter.format(new Date(`${transaction.date.slice(0, 10)}T00:00:00`))}</DetailItem>
            <DetailItem icon={Tags} label="Danh mục">{transaction.category?.name ?? "Không xác định"}</DetailItem>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
            <DetailItem icon={WalletCards} label="Số tiền">
              <span className={cn("text-base font-bold", isIncome ? "text-emerald-600" : "text-rose-600")}>{isIncome ? "+" : "−"}{money.format(transaction.amount)}</span>
            </DetailItem>
            <DetailItem icon={ReceiptText} label="Nội dung">{transaction.description || "—"}</DetailItem>
          </div>

          <section className="mt-5">
            <h3 className="text-sm font-bold text-gray-800">Chứng từ</h3>
            <DetailAttachments entityLabel="chứng từ" images={transaction.receiptImages} files={transaction.receiptFiles} links={transaction.receiptLinks} />
          </section>
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>Đóng</Button>
          <Button type="button" onClick={onEdit}><Pencil className="h-4 w-4" />Chỉnh sửa</Button>
        </footer>
      </div>
    </div>
  );
}

function DetailItem({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3"><p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><Icon className="h-3.5 w-3.5" />{label}</p><div className="text-sm font-medium text-gray-700">{children}</div></div>;
}
