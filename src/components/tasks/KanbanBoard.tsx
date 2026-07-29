"use client";

import { useMemo, useState } from "react";
import type { TaskStatus, WorkTask } from "@/types/task";
import type { Project, ProjectMember } from "@/types/project";
import { KanbanColumn } from "@/components/tasks/KanbanColumn";
import { KANBAN_COLUMNS } from "@/components/tasks/kanban-meta";

interface KanbanBoardProps {
  tasks: WorkTask[];
  projectsById: Map<string, Project>;
  membersById: Map<string, ProjectMember>;
  onMove: (task: WorkTask, status: TaskStatus, position: number) => void;
  onAdd: (status: TaskStatus) => void;
  onOpen: (task: WorkTask) => void;
  onReport: (task: WorkTask) => void;
  onViewReports: (task: WorkTask) => void;
  onEdit: (task: WorkTask) => void;
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

export function KanbanBoard({
  tasks,
  projectsById,
  membersById,
  onMove,
  onAdd,
  onOpen,
  onReport,
  onViewReports,
  onEdit,
}: KanbanBoardProps) {
  const [draggingTask, setDraggingTask] = useState<WorkTask | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const columns = useMemo(() => {
    const grouped = new Map<TaskStatus, WorkTask[]>(
      KANBAN_COLUMNS.map((status) => [status, []])
    );
    for (const task of tasks) {
      grouped.get(task.status)?.push(task);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    }
    return grouped;
  }, [tasks]);

  function resetDrag() {
    setDraggingTask(null);
    setDropTarget(null);
  }

  function handleDrop(status: TaskStatus, index: number) {
    const task = draggingTask;
    resetDrag();
    if (!task) return;

    let position = index;
    if (task.status === status) {
      const sourceIndex = (columns.get(status) ?? []).findIndex(
        (item) => item.id === task.id
      );
      // Danh sách hiển thị vẫn còn thẻ đang kéo nên phải bù lại một bậc.
      if (sourceIndex !== -1 && sourceIndex < index) position -= 1;
      if (sourceIndex === position) return;
    }

    onMove(task, status, Math.max(0, position));
  }

  return (
    <div className="flex min-h-full overflow-x-auto">
      {KANBAN_COLUMNS.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={columns.get(status) ?? []}
          projectsById={projectsById}
          membersById={membersById}
          draggingTaskId={draggingTask?.id ?? null}
          dropIndex={dropTarget?.status === status ? dropTarget.index : null}
          onDropIndexChange={(columnStatus, index) =>
            setDropTarget(index === null ? null : { status: columnStatus, index })
          }
          onDropCard={handleDrop}
          onAdd={onAdd}
          onOpen={onOpen}
          onReport={onReport}
          onViewReports={onViewReports}
          onEdit={onEdit}
          onDragStart={setDraggingTask}
          onDragEnd={resetDrag}
        />
      ))}
    </div>
  );
}
