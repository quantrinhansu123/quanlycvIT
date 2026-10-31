"use client";

import { useId, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import Image from "next/image";
import type { Subtask } from "@/types/subtask";
import { letterIndex, selectedAcceptanceDetails } from "@/lib/task-detail-report";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

export function AcceptanceMinutesPopup({ task, selectedIds, workTaskTitle, disabled, directPrint = false }: {
  task: Subtask; selectedIds: string[]; workTaskTitle?: string; disabled?: boolean; directPrint?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [printing, setPrinting] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const { notify } = useFeedback();
  const entries = selectedAcceptanceDetails(task, selectedIds);

  async function print() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      notify({ type: "error", title: "Không mở được cửa sổ in", description: "Hãy cho phép cửa sổ bật lên rồi thử lại." });
      return;
    }
    printWindow.opener = null;
    printWindow.document.body.textContent = "Đang chuẩn bị biên bản nghiệm thu...";
    setPrinting(true);
    try {
      const { printAcceptanceMinutes } = await import("@/lib/task-detail-pdf");
      await printAcceptanceMinutes(task, selectedIds, printWindow, workTaskTitle, receiverName);
    } catch (error) {
      printWindow.close();
      notify({ type: "error", title: "Không thể in biên bản", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setPrinting(false);
    }
  }

  if (directPrint) return (
    <Button type="button" variant="secondary" size="sm" disabled={printing || disabled || !entries.length}
      title="In nội dung nghiệm thu đã lưu của chi tiết này"
      onClick={() => void print()}>
      <Printer className="h-4 w-4" />{printing ? "Đang chuẩn bị..." : "In nghiệm thu"}
    </Button>
  );

  return <>
    <Button type="button" variant="secondary" size="sm" disabled={disabled || !entries.length} onClick={() => dialog.current?.showModal()}>
      Biên bản nghiệm thu ({entries.length})
    </Button>
    <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto h-[96dvh] max-h-[96dvh] w-[min(1400px,calc(100vw-1.5rem))] overflow-auto rounded-2xl border border-gray-200 bg-white p-5 text-gray-800 shadow-xl backdrop:bg-black/40">
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 mb-5 flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
        <h2 id={titleId} className="text-lg font-bold">Biên bản nghiệm thu</h2>
        <Button type="button" size="sm" disabled={printing || disabled || !entries.length} onClick={() => void print()}><Printer className="h-4 w-4" />{printing ? "Đang chuẩn bị..." : "In nghiệm thu"}</Button>
        <button type="button" autoFocus aria-label="Đóng biên bản" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-6 flex items-center justify-between gap-4 border-b-2 border-brand-600 pb-4">
        <Image src="/logo-viet-nhat-ipt.png" alt="Việt Nhật IPT" width={140} height={63} className="h-auto w-32" />
        <div className="text-right text-xs text-gray-500"><p className="font-bold text-gray-900">VIỆT NHẬT IPT</p><p className="mt-1">Số: NT-{task.id.slice(0, 8).toUpperCase()}</p><p className="mt-1">Ngày lập: {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}</p></div>
      </div>
      <h3 className="text-center text-2xl font-bold tracking-wide text-gray-900">BIÊN BẢN NGHIỆM THU</h3>
      <p className="mb-6 mt-2 text-center text-xs text-gray-500">Xác nhận nội dung và trạng thái thực hiện công việc</p>
      <dl className="mb-6 grid grid-cols-4 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
        <div className="min-w-0"><dt className="text-xs text-gray-500">TASK</dt><dd className="mt-1 break-words font-semibold">{task.title}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-gray-500">CÔNG VIỆC</dt><dd className="mt-1 break-words">{workTaskTitle || "—"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-gray-500">NGƯỜI PHỤ TRÁCH</dt><dd className="mt-1 break-words">{task.assignees.map((person) => person.name).join(", ") || "—"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-gray-500">NGƯỜI NHẬN BÀN GIAO</dt><dd className="mt-1"><input type="text" value={receiverName} maxLength={120} placeholder="Nhập tên người nhận..." aria-label="Người nhận bàn giao" onChange={(event) => setReceiverName(event.target.value)} className="w-full border-b border-dashed border-gray-300 bg-transparent py-0.5 text-sm outline-none focus:border-violet-500" /></dd></div>
      </dl>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">01 &nbsp; NỘI DUNG NGHIỆM THU</h3><span className="text-xs text-gray-500">{entries.length} hạng mục / {entries.filter((entry) => entry.status === "Hoàn thành").length} hoàn thành</span></div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
          <thead className="bg-gray-800 text-xs text-white"><tr><th scope="col" className="w-12 p-3">STT</th><th scope="col" className="p-3">Nội dung nghiệm thu</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{entries.map((entry, index) => <tr key={entry.id} className="align-top">
            <td className="p-3 font-semibold text-gray-700">{letterIndex(index)}</td>
            <td className="break-words p-4">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{entry.title}</p>
                  {entry.description !== "—" && <p className="mt-2 whitespace-pre-wrap leading-6">{entry.description}</p>}
                </div>
                <p className="text-xs leading-5"><strong>Trạng thái:</strong> {entry.status}</p>
                <p className="whitespace-pre-wrap text-xs leading-5"><strong>Ghi chú:</strong> {entry.note}</p>
              </div>
              {entry.items.length > 0 && (
                <ol className="mt-3 space-y-1 text-xs leading-5">
                  {entry.items.map((item, itemIndex) => <li key={item.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-6">
                    <span className="text-gray-500">{itemIndex + 1}.</span>
                    <span className="whitespace-pre-wrap break-words text-gray-900">{item.name || "—"}</span>
                    <span className="whitespace-pre-wrap break-words text-gray-500">{item.note}</span>
                  </li>)}
                </ol>
              )}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs italic text-gray-500">Biên bản ghi nhận trạng thái của các hạng mục được chọn tại thời điểm lập.</p>
      <h3 className="mb-5 mt-6 text-sm font-bold">02 &nbsp; XÁC NHẬN CÁC BÊN</h3>
      <div className="grid grid-cols-2 gap-6 pb-6 text-center text-xs">
        {["ĐẠI DIỆN BÀN GIAO", "ĐẠI DIỆN NGHIỆM THU"].map((label) => <div key={label}><p className="font-bold">{label}</p><p className="mt-2 italic text-gray-500">Ký và ghi rõ họ tên</p><p className="mt-16 text-gray-400">........................................</p></div>)}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => dialog.current?.close()}>Đóng</Button>
        <Button type="button" size="sm" disabled={printing || disabled || !entries.length} onClick={() => void print()}><Printer className="h-4 w-4" />{printing ? "Đang chuẩn bị..." : "In nghiệm thu / Lưu PDF"}</Button>
      </div>
    </dialog>
  </>;
}
