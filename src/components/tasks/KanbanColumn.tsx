"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import type { TaskStatus, WorkTask } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { KanbanCard } from "@/components/tasks/KanbanCard";
import { KANBAN_STATUS_META } from "@/components/tasks/kanban-meta";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: WorkTask[];
  projectsById: Map<string, Project>;
  membersById: Map<string, ProjectMember>;
  draggingTaskId: string | null;
  /** Vị trí chèn đang được xem trước, null nếu con trỏ không ở cột này. */
  dropIndex: number | null;
  onDropIndexChange: (status: TaskStatus, index: number | null) => void;
  onDropCard: (status: TaskStatus, index: number) => void;
  onAdd: (status: TaskStatus) => void;
  onOpen: (task: WorkTask) => void;
  onReport: (task: WorkTask) => void;
  onViewReports: (task: WorkTask) => void;
  onEdit: (task: WorkTask) => void;
  onDragStart: (task: WorkTask) => void;
  onDragEnd: () => void;
}

export function KanbanColumn({
  status,
  tasks,
  projectsById,
  membersById,
  draggingTaskId,
  dropIndex,
  onDropIndexChange,
  onDropCard,
  onAdd,
  onOpen,
  onReport,
  onViewReports,
  onEdit,
  onDragStart,
  onDragEnd,
}: KanbanColumnProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const meta = KANBAN_STATUS_META[status];

  /** Vị trí chèn = số thẻ mà con trỏ đã vượt qua điểm giữa. */
  function indexFromPointer(clientY: number): number {
    const body = bodyRef.current;
    if (!body) return tasks.length;
    const cards = Array.from(
      body.querySelectorAll<HTMLElement>("[data-card-id]")
    );
    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }
    return cards.length;
  }

  return (
    <section
      className={cn(
        "flex min-w-[300px] flex-1 flex-col border-r last:border-r-0",
        meta.column,
        meta.border
      )}
    >
      <header className="flex items-center gap-2 px-4 py-3.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
        <h2 className="text-[15px] font-bold text-gray-900">{meta.label}</h2>
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-500">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => onAdd(status)}
          title={`Thêm công việc vào "${meta.label}"`}
          aria-label={`Thêm công việc vào ${meta.label}`}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <Plus className="h-4 w-4" />
        </button>
      </header>

      <div
        ref={bodyRef}
        onDragOver={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDropIndexChange(status, indexFromPointer(event.clientY));
        }}
        onDragLeave={(event) => {
          // Bỏ qua khi con trỏ chỉ đi qua thẻ con bên trong cột.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          onDropIndexChange(status, null);
        }}
        onDrop={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          onDropCard(status, indexFromPointer(event.clientY));
        }}
        className={cn(
          "flex-1 space-y-3 border-t p-3 transition-colors",
          meta.border,
          dropIndex !== null ? meta.drop : meta.body
        )}
      >
        {tasks.map((task, index) => (
          <div key={task.id}>
            {dropIndex === index && <DropPlaceholder />}
            <KanbanCard
              task={task}
              project={projectsById.get(task.projectId)}
              assignee={membersById.get(task.assigneeId)}
              dragging={draggingTaskId === task.id}
              onOpen={onOpen}
              onReport={onReport}
              onViewReports={onViewReports}
              onEdit={onEdit}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </div>
        ))}

        {dropIndex === tasks.length && <DropPlaceholder />}

        {tasks.length === 0 && dropIndex === null && (
          <p className="rounded-xl border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400">
            Chưa có công việc
          </p>
        )}
      </div>
    </section>
  );
}

function DropPlaceholder() {
  return <div className="mb-3 h-1 rounded-full bg-blue-400" />;
}
