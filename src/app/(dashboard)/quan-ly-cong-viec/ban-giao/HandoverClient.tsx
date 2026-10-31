"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  FileDown,
  LoaderCircle,
  Printer,
  ScrollText,
  Search,
  UserRound,
} from "lucide-react";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { subtaskService, type SubtaskPage } from "@/services/subtask-service";
import { taskService } from "@/services/task-service";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { groupTaskDetailsForReport, letterIndex } from "@/lib/task-detail-report";
import type { HandoverPrintInput, HandoverPrintRow } from "@/lib/handover-pdf";
import { cn, formatDateVN } from "@/lib/utils";
import type { AccountRole } from "@/types/account";
import type { AcceptanceItem, AcceptanceStatus, Subtask } from "@/types/subtask";
import type { WorkTaskDirectoryItem } from "@/types/task";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TaskStatusBadge } from "@/components/tasks/TaskBadges";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

const EMPTY_SUBTASKS: Subtask[] = [];
const EMPTY_WORK_TASKS: WorkTaskDirectoryItem[] = [];

type DocRow = {
  id: string;
  title: string;
  description: string;
  personnel: string;
  note: string;
  items: AcceptanceItem[];
  imageUrl: string;
  statusValue: AcceptanceStatus;
  statusLabel: string;
};

function buildRowContent(row: DocRow): string {
  const parts: string[] = [];
  if (row.description !== "—") parts.push(row.description);
  if (row.items.length > 0) {
    parts.push(
      row.items
        .map((item, index) => `${index + 1}. ${item.name || "—"}${item.note ? ` — ${item.note}` : ""}`)
        .join("\n")
    );
  }
  if (row.note !== "—") parts.push(`Ghi chú: ${row.note}`);
  return parts.join("\n\n");
}

function buildPrintInput(
  task: Subtask,
  workTaskTitle: string | undefined,
  rows: DocRow[]
): HandoverPrintInput {
  const printRows: HandoverPrintRow[] = rows.map((row) => ({
    label: row.title,
    content: buildRowContent(row),
    statusLabel: row.statusLabel,
    handedOver: row.statusValue === "accepted",
    imageUrls: row.imageUrl ? [row.imageUrl] : [],
  }));

  return {
    taskTitle: task.title,
    workTaskTitle,
    assignees: task.assignees.map((person) => person.name).join(", "),
    tester: task.tester?.name,
    dueDate: task.dueDate ? formatDateVN(task.dueDate) : undefined,
    note: task.handover?.text ?? "",
    handoverImageUrl: task.handover?.imageUrl ?? "",
    rows: printRows,
  };
}

export function HandoverClient({
  accountId,
  accountRole,
  initialSubtasks,
}: {
  accountId: string;
  accountRole: AccountRole;
  initialSubtasks: SubtaskPage;
}) {
  const { notify } = useFeedback();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const listKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.subtasksList,
    filters: { view: "handover" },
    page: 1,
    pageSize: 200,
  });

  const { data: page, status: listStatus, error: listError, refresh } = useSessionQuery<SubtaskPage>({
    key: listKey,
    fetcher: (signal) => subtaskService.getSubtasksPage({ page: 1, pageSize: 200 }, { signal }),
    ttl: CACHE_TTL.list,
    initialData: initialSubtasks,
  });

  const workTasksKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.directoryTasks,
  });
  const { data: workTasksData } = useSessionQuery<WorkTaskDirectoryItem[]>({
    key: workTasksKey,
    fetcher: (signal) => taskService.getTaskDirectory({ signal }),
    ttl: CACHE_TTL.directory,
  });

  const subtasks = page?.items ?? EMPTY_SUBTASKS;
  const workTasks = workTasksData ?? EMPTY_WORK_TASKS;
  const workTasksById = useMemo(() => new Map(workTasks.map((task) => [task.id, task])), [workTasks]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return subtasks;
    return subtasks.filter((task) => {
      const haystack = [
        task.title,
        workTasksById.get(task.workTaskId)?.title ?? "",
        ...task.assignees.map((person) => person.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [subtasks, search, workTasksById]);

  const selected = filtered.find((task) => task.id === selectedId) ?? filtered[0];

  const rows = useMemo<DocRow[]>(() => {
    if (!selected) return [];
    return groupTaskDetailsForReport(selected).flatMap((group) =>
      group.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        personnel: entry.personnel,
        note: entry.note,
        items: entry.items,
        imageUrl: entry.imageUrl,
        statusValue: group.value,
        statusLabel: group.label,
      }))
    );
  }, [selected]);

  const workTaskTitle = selected ? workTasksById.get(selected.workTaskId)?.title : undefined;
  const handoverImage = selected?.handover?.imageUrl ?? "";
  const handoverNote = selected?.handover?.text?.trim() ?? "";
  const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  async function exportDocument(mode: "download" | "print") {
    if (!selected || busy) return;
    setBusy(mode);
    let printWindow: Window | null = null;
    try {
      if (mode === "print") {
        printWindow = window.open("", "_blank");
        if (!printWindow) {
          throw new Error("Hãy cho phép cửa sổ bật lên trên trình duyệt rồi thử lại.");
        }
        printWindow.opener = null;
        printWindow.document.title = "Đang chuẩn bị văn bản bàn giao...";
        printWindow.document.body.textContent = "Đang chuẩn bị văn bản bàn giao...";
      }
      const { exportHandoverPdf } = await import("@/lib/handover-pdf");
      await exportHandoverPdf(
        buildPrintInput(selected, workTaskTitle, rows),
        printWindow ? { printWindow } : {}
      );
      notify({
        type: "success",
        title: mode === "print" ? "Đã mở hộp thoại in văn bản bàn giao" : "Đã tải văn bản bàn giao (PDF)",
      });
    } catch (error) {
      printWindow?.close();
      notify({
        type: "error",
        title: "Không thể xuất văn bản bàn giao",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setBusy(null);
    }
  }

  const showEmpty = listStatus === "success" && filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 xl:flex-row">
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-gray-200 bg-white xl:h-full xl:w-[360px] xl:border-b-0 xl:border-r">
        <div className="border-b border-gray-100 px-4 py-4">
          <h1 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <ScrollText className="h-5 w-5 text-brand-600" />
            Văn bản bàn giao
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Chọn một Task để xem và xuất văn bản bàn giao dạng A4.
          </p>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 focus-within:border-brand-400 focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm Task, công việc, người thực hiện..."
              className="h-full w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {listStatus === "error" && !page ? (
            <div className="p-4 text-center text-sm text-rose-600">
              <p>Không tải được danh sách Task.</p>
              <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={refresh}>
                Thử lại
              </Button>
              {listError ? <p className="mt-2 text-xs text-gray-400">{getErrorMessage(listError, "")}</p> : null}
            </div>
          ) : listStatus === "loading" && !page ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : showEmpty ? (
            <EmptyState
              icon={ScrollText}
              title={search ? "Không tìm thấy Task phù hợp" : "Chưa có Task nào"}
              description={
                search
                  ? "Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm."
                  : "Các Task bạn phụ trách sẽ xuất hiện ở đây để lập văn bản bàn giao."
              }
            />
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((task) => {
                const active = selected?.id === task.id;
                const workTask = workTasksById.get(task.workTaskId);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      className={cn(
                        "w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition",
                        active
                          ? "border-brand-300 bg-brand-50/70 shadow-sm"
                          : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-semibold text-gray-800">{task.title}</p>
                        <TaskStatusBadge status={task.status} className="shrink-0 px-2 py-0.5 text-[10px]" />
                      </div>
                      {workTask ? (
                        <p className="mt-1 truncate text-xs text-gray-500">{workTask.title}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                        <span className="flex min-w-0 items-center gap-1">
                          <UserRound className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {task.assignees.map((person) => person.name).join(", ") || "Chưa có người phụ trách"}
                          </span>
                        </span>
                        {task.dueDate ? (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDateVN(task.dueDate)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {selected ? (
          <div className="mx-auto w-full max-w-[900px] px-3 py-4 sm:px-6 sm:py-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                {filtered.length} Task
                {search ? " phù hợp" : ""} · Xem trước văn bản A4
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void exportDocument("print")}
                >
                  {busy === "print" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  In văn bản
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-brand-600 hover:bg-brand-700"
                  disabled={busy !== null}
                  onClick={() => void exportDocument("download")}
                >
                  {busy === "download" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Tải PDF
                </Button>
              </div>
            </div>

            <article className="rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
              <header className="border-b border-gray-100 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-900">Việt Nhật IPT</p>
                    <p className="mt-1 text-[11px] text-gray-500">Hệ thống quản lý công việc</p>
                  </div>
                  <div className="text-right text-[11px] text-gray-500">
                    <p>
                      Số: <span className="font-semibold text-gray-700">BG-{selected.id.slice(0, 8).toUpperCase()}</span>
                    </p>
                    <p className="mt-1">Ngày lập: {today}</p>
                  </div>
                </div>
                <h2 className="mt-6 text-center text-xl font-bold uppercase tracking-wide text-gray-900 sm:text-2xl">
                  Văn bản bàn giao
                </h2>
                <p className="mt-1 text-center text-xs text-gray-500">
                  Xác nhận nội dung và trạng thái bàn giao công việc
                </p>
              </header>

              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-gray-50 p-4 text-sm lg:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Task</dt>
                  <dd className="mt-0.5 break-words font-semibold text-gray-800">{selected.title}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Công việc</dt>
                  <dd className="mt-0.5 break-words text-gray-700">{workTaskTitle || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Người thực hiện</dt>
                  <dd className="mt-0.5 break-words text-gray-700">
                    {selected.assignees.map((person) => person.name).join(", ") || "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Người nghiệm thu</dt>
                  <dd className="mt-0.5 break-words text-gray-700">{selected.tester?.name || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Hạn hoàn thành</dt>
                  <dd className="mt-0.5 text-gray-700">{selected.dueDate ? formatDateVN(selected.dueDate) : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">Trạng thái Task</dt>
                  <dd className="mt-1"><TaskStatusBadge status={selected.status} className="px-2 py-0.5 text-[11px]" /></dd>
                </div>
              </dl>

              <section className="mt-7">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                  <h3 className="text-sm font-bold text-gray-900">01 &nbsp; Nội dung bàn giao</h3>
                  <span className="text-[11px] text-gray-500">
                    {rows.length} hạng mục · {rows.filter((row) => row.statusValue === "accepted").length} hoàn thành
                  </span>
                </div>

                {handoverNote ? (
                  <p className="mb-4 whitespace-pre-wrap rounded-lg bg-brand-50/60 px-3 py-2.5 text-sm leading-6 text-gray-700">
                    {handoverNote}
                  </p>
                ) : null}

                {rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-400">
                    Task chưa có chi tiết/ hạng mục để bàn giao.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {rows.map((row, index) => (
                      <li key={row.id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-600">
                              {letterIndex(index)}
                            </span>
                            <div className="min-w-0">
                              <h4 className="break-words text-sm font-semibold text-gray-900">{row.title}</h4>
                              {row.personnel !== "—" ? (
                                <p className="mt-0.5 text-[11px] text-gray-500">Phụ trách: {row.personnel}</p>
                              ) : null}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                              row.statusValue === "accepted"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.statusValue === "cancelled"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-amber-50 text-amber-700"
                            )}
                          >
                            {row.statusLabel}
                          </span>
                        </div>

                        {row.description !== "—" ? (
                          <p className="mt-2 whitespace-pre-wrap break-words pl-8 text-sm leading-6 text-gray-700">
                            {row.description}
                          </p>
                        ) : null}

                        {row.items.length > 0 ? (
                          <ol className="mt-2 space-y-1 pl-8 text-sm leading-6 text-gray-700">
                            {row.items.map((item, itemIndex) => (
                              <li key={item.id} className="flex gap-2">
                                <span className="shrink-0 text-xs text-gray-400">{itemIndex + 1}.</span>
                                <span className="min-w-0 break-words">
                                  {item.name || "—"}
                                  {item.note ? <span className="text-gray-500"> — {item.note}</span> : null}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}

                        {row.note !== "—" ? (
                          <p className="mt-2 whitespace-pre-wrap break-words pl-8 text-sm leading-6 text-gray-600">
                            <span className="font-semibold text-gray-700">Ghi chú: </span>
                            {row.note}
                          </p>
                        ) : null}

                        {row.imageUrl ? (
                          <div className="mt-2 pl-8">
                            <img
                              src={row.imageUrl}
                              alt={`Ảnh bàn giao: ${row.title}`}
                              className="max-h-48 w-auto max-w-full rounded-lg border border-gray-200 object-contain"
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {handoverImage ? (
                <section className="mt-7">
                  <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-gray-900">
                    02 &nbsp; Ảnh bàn giao
                  </h3>
                  <img
                    src={handoverImage}
                    alt="Ảnh bàn giao"
                    className="max-h-80 w-auto max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                </section>
              ) : null}

              <section className="mt-8 border-t border-gray-200 pt-6">
                <h3 className="mb-6 text-sm font-bold text-gray-900">
                  {handoverImage ? "03" : "02"} &nbsp; Xác nhận các bên
                </h3>
                <div className="grid grid-cols-2 gap-6 text-center text-xs">
                  {["Đại diện bàn giao", "Đại diện nghiệm thu"].map((label) => (
                    <div key={label}>
                      <p className="font-bold uppercase text-gray-800">{label}</p>
                      <p className="mt-1 italic text-gray-400">Ký và ghi rõ họ tên</p>
                      <p className="mt-16 text-gray-300">........................................</p>
                    </div>
                  ))}
                </div>
              </section>

              <p className="mt-6 border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
                Văn bản ghi nhận nội dung và trạng thái bàn giao tại thời điểm lập.
              </p>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={ScrollText}
              title="Chọn một Task để xem văn bản bàn giao"
              description="Danh sách Task nằm ở cột bên trái. Bạn có thể tìm nhanh theo tên Task, công việc hoặc người thực hiện."
            />
          </div>
        )}
      </main>
    </div>
  );
}
