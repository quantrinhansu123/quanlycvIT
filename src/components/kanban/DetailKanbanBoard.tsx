"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, GripVertical } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import type { AcceptanceStatus } from "@/types/subtask";
import type { KanbanDetailItem } from "@/types/kanban-detail";
import { TaskPriorityBadge } from "@/components/tasks/TaskBadges";

const COLUMNS: { status: AcceptanceStatus; label: string; color: string }[] = [
  { status: "pending", label: "Chưa hoàn thành", color: "bg-amber-400" },
  { status: "inProgress", label: "Đang làm", color: "bg-blue-500" },
  { status: "testing", label: "Đang test", color: "bg-sky-500" },
  { status: "tested", label: "Đã test", color: "bg-indigo-500" },
  { status: "acceptance", label: "Nghiệm thu", color: "bg-purple-500" },
  { status: "rework", label: "Làm lại", color: "bg-rose-500" },
  { status: "cancelled", label: "Hủy bỏ", color: "bg-gray-400" },
  { status: "accepted", label: "Hoàn thành", color: "bg-emerald-500" },
];

export function DetailKanbanBoard({ items, movingId, onMove }: {
  items: KanbanDetailItem[];
  movingId: string | null;
  onMove: (item: KanbanDetailItem, status: AcceptanceStatus) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<AcceptanceStatus | null>(null);
  return <div className="flex h-full min-h-[480px] gap-4 overflow-x-auto px-4 py-5">
    {COLUMNS.map((column) => {
      const cards = items.filter((item) => item.status === column.status);
      return <section key={column.status}
        aria-label={column.label}
        className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-white p-2 transition-colors", overStatus === column.status ? "border-brand-500 bg-brand-50" : "border-gray-200")}
        onDragOver={(event) => { if (draggedId) { event.preventDefault(); setOverStatus(column.status); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStatus(null); }}
        onDrop={(event) => {
          event.preventDefault();
          const item = items.find((entry) => entry.id === draggedId);
          if (item && item.status !== column.status) onMove(item, column.status);
          setDraggedId(null);
          setOverStatus(null);
        }}
      >
        <header className="flex items-center justify-between px-2 py-2 text-sm font-semibold text-gray-700">
          <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", column.color)} />{column.label}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{cards.length}</span>
        </header>
        <div className="min-h-24 flex-1 space-y-2 overflow-y-auto p-1">
          {cards.map((item) => <article key={item.id}
            draggable={item.taskStatus !== "done" && !movingId}
            onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => { setDraggedId(null); setOverStatus(null); }}
            className={cn("rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md", item.taskStatus === "done" ? "opacity-60" : "cursor-grab active:cursor-grabbing", movingId === item.id && "opacity-50")}
          >
            <div className="flex items-start gap-1">
              <GripVertical aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <Link draggable={false} href={`/quan-ly-cong-viec/danh-sach-task/${item.taskId}#detail-${encodeURIComponent(item.detailId)}`}
                className="min-w-0 break-words text-sm font-semibold text-gray-900 hover:text-brand-600 hover:underline">{item.title}</Link>
            </div>
            <p className="mt-2 truncate text-xs text-gray-500" title={item.taskTitle}>Task: {item.taskTitle}</p>
            {item.workTaskTitle && <p className="truncate text-xs text-gray-400" title={item.workTaskTitle}>Công việc: {item.workTaskTitle}</p>}
            {item.note && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{item.note}</p>}
            <div className="mt-3 flex items-center justify-between gap-2">
              <TaskPriorityBadge priority={item.priority} />
              {item.dueDate && <span className="flex items-center gap-1 text-[11px] text-gray-500"><CalendarDays className="h-3 w-3" />{formatDateVN(item.dueDate)}</span>}
            </div>
          </article>)}
          {cards.length === 0 && <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">Trống</p>}
        </div>
      </section>;
    })}
  </div>;
}
