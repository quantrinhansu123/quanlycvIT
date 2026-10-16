"use client";

import { useId, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import Image from "next/image";
import type { Subtask } from "@/types/subtask";
import { selectedAcceptanceDetails } from "@/lib/task-detail-report";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

export function AcceptanceMinutesPopup({ task, selectedIds, workTaskTitle, disabled }: {
  task: Subtask; selectedIds: string[]; workTaskTitle?: string; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [printing, setPrinting] = useState(false);
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
      await printAcceptanceMinutes(task, selectedIds, printWindow, workTaskTitle);
    } catch (error) {
      printWindow.close();
      notify({ type: "error", title: "Không thể in biên bản", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setPrinting(false);
    }
  }

  return <>
    <Button type="button" variant="secondary" size="sm" disabled={disabled || !entries.length} onClick={() => dialog.current?.showModal()}>
      Biên bản nghiệm thu ({entries.length})
    </Button>
    <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[85dvh] w-[min(960px,calc(100vw-2rem))] overflow-auto rounded-2xl border border-gray-200 bg-white p-5 text-gray-800 shadow-xl backdrop:bg-black/40">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold">Biên bản nghiệm thu</h2>
        <button type="button" autoFocus aria-label="Đóng biên bản" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-6 flex items-center justify-between gap-4 border-b-2 border-brand-600 pb-4">
        <Image src="/logo-viet-nhat-ipt.png" alt="Việt Nhật IPT" width={140} height={63} className="h-auto w-32" />
        <div className="text-right text-xs text-gray-500"><p className="font-bold text-gray-900">VIỆT NHẬT IPT</p><p className="mt-1">Số: NT-{task.id.slice(0, 8).toUpperCase()}</p><p className="mt-1">Ngày lập: {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}</p></div>
      </div>
      <h3 className="text-center text-2xl font-bold tracking-wide text-gray-900">BIÊN BẢN NGHIỆM THU</h3>
      <p className="mb-6 mt-2 text-center text-xs text-gray-500">Xác nhận nội dung và trạng thái thực hiện công việc</p>
      <dl className="mb-6 grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
        <div className="min-w-0"><dt className="text-xs text-gray-500">TASK</dt><dd className="mt-1 break-words font-semibold">{task.title}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-gray-500">CÔNG VIỆC</dt><dd className="mt-1 break-words">{workTaskTitle || "—"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-gray-500">NGƯỜI PHỤ TRÁCH</dt><dd className="mt-1 break-words">{task.assignees.map((person) => person.name).join(", ") || "—"}</dd></div>
      </dl>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">01 &nbsp; NỘI DUNG NGHIỆM THU</h3><span className="text-xs text-gray-500">{entries.length} hạng mục / {entries.filter((entry) => entry.status === "Hoàn thành").length} hoàn thành</span></div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
          <thead className="bg-gray-800 text-xs text-white"><tr><th className="w-12 p-3">STT</th><th className="p-3">Chi tiết Task</th><th className="p-3">Nội dung</th><th className="w-36 p-3">Trạng thái</th><th className="w-32 p-3">Ghi chú</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{entries.map((entry, index) => <tr key={entry.id} className="align-top">
            <td className="p-3">{index + 1}</td><td className="break-words p-3 font-medium">{entry.title}</td><td className="whitespace-pre-wrap break-words p-3">{entry.description}</td><td className="p-3"><span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${entry.status === "Hoàn thành" ? "bg-emerald-50 text-emerald-700" : entry.status === "Làm lại" || entry.status === "Hủy bỏ" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{entry.status}</span></td>
            <td className="whitespace-pre-wrap break-words p-3">{entry.note}</td>
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
        <Button type="button" size="sm" disabled={printing} onClick={() => void print()}><Printer className="h-4 w-4" />{printing ? "Đang chuẩn bị..." : "In / Lưu PDF"}</Button>
      </div>
    </dialog>
  </>;
}
