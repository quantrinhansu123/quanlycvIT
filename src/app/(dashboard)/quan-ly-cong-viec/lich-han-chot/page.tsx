"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService, type TaskFilters } from "@/services/task-service";
import type { Project, ProjectMember } from "@/types/project";
import type { WorkTask, TaskPriority } from "@/types/task";
import { TASK_PRIORITY_OPTIONS } from "@/types/task";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { DeadlineCalendar } from "@/components/calendar/DeadlineCalendar";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { MONTH_NAMES, getWeekRange, formatWeekHeader } from "@/lib/calendar-utils";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskQuickViewModal } from "@/components/tasks/TaskQuickViewModal";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";

type ViewMode = "month" | "week" | "day";
type FormModalState = { mode: "create" } | { mode: "edit"; task: WorkTask } | null;
type QuickViewState = { task: WorkTask } | null;

export default function DeadlineCalendarPage() {
  const router = useRouter();
  const { notify } = useFeedback();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekRange(today).weekStart);

  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [quickView, setQuickView] = useState<QuickViewState>(null);

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  function currentFilters(): TaskFilters {
    return {
      search: search || undefined,
      projectId: projectId || undefined,
      assigneeId: assigneeId || undefined,
      priority: priority || undefined,
    };
  }

  const loadTasks = useCallback(
    async (filters: TaskFilters) => {
      setLoading(true);
      try {
        const data = await taskService.getTasks(filters);
        setTasks(data);
      } catch (loadError) {
        notify({
          type: "error",
          title: "Không thể tải danh sách công việc",
          description: getErrorMessage(
            loadError,
            "Vui lòng kiểm tra kết nối và thử lại."
          ),
        });
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  // Load projects + members once
  useEffect(() => {
    Promise.all([
      projectService.getProjects(),
      projectService.getDirectory(),
    ])
      .then(([projectData, memberData]) => {
        setProjects(projectData);
        setMembers(memberData);
      })
      .catch((err) => {
        notify({
          type: "error",
          title: "Không thể tải dữ liệu bộ lọc",
          description: getErrorMessage(
            err,
            "Không thể tải dự án hoặc danh sách nhân sự."
          ),
        });
      });
  }, [notify]);

  // Load tasks when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTasks({
        search: search || undefined,
        projectId: projectId || undefined,
        assigneeId: assigneeId || undefined,
        priority: priority || undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, projectId, assigneeId, priority, loadTasks]);

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setWeekStart(getWeekRange(now).weekStart);
  }

  function goPrev() {
    if (viewMode === "week") {
      const prev = new Date(weekStart);
      prev.setDate(prev.getDate() - 7);
      setWeekStart(prev);
    } else {
      if (month === 0) {
        setYear((y) => y - 1);
        setMonth(11);
      } else {
        setMonth((m) => m - 1);
      }
    }
  }

  function goNext() {
    if (viewMode === "week") {
      const next = new Date(weekStart);
      next.setDate(next.getDate() + 7);
      setWeekStart(next);
    } else {
      if (month === 11) {
        setYear((y) => y + 1);
        setMonth(0);
      } else {
        setMonth((m) => m + 1);
      }
    }
  }

  // Compute week end for header display
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [weekStart]);

  /** Click vào task bar trên lịch → mở Quick View */
  function handleTaskClick(task: WorkTask) {
    setQuickView({ task });
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Top filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm công việc..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <FilterSelect
          label="Dự án"
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.code }))}
        />
        <FilterSelect
          label="Người phụ trách"
          value={assigneeId}
          onChange={setAssigneeId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
        <FilterSelect
          label="Mức độ ưu tiên"
          value={priority}
          onChange={(v) => setPriority(v as TaskPriority | "")}
          options={TASK_PRIORITY_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />

        <div className="ml-auto">
          <Button onClick={() => setFormModal({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm công việc
          </Button>
        </div>
      </div>

      {/* Calendar navigation bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Hôm Nay
          </button>
        </div>

        <h2 className="text-lg font-bold text-gray-900">
          {viewMode === "week"
            ? formatWeekHeader(weekStart, weekEnd)
            : `${MONTH_NAMES[month + 1]} năm ${year}`}
        </h2>

        <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
          {(["month", "week", "day"] as ViewMode[]).map((mode, idx) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`flex h-9 items-center px-3.5 text-sm font-medium transition-colors ${
                idx > 0 ? "border-l border-gray-200" : ""
              } ${
                viewMode === mode
                  ? "bg-gray-100 text-gray-800"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {mode === "month" ? "Tháng" : mode === "week" ? "Tuần" : "Ngày"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar content */}
      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-blue-500" />
            <span className="text-sm text-gray-400">Đang tải lịch...</span>
          </div>
        </div>
      ) : viewMode === "week" ? (
        <WeekCalendar
          weekStart={weekStart}
          tasks={tasks}
          projectsById={projectsById}
          membersById={membersById}
          onTaskClick={handleTaskClick}
        />
      ) : (
        <DeadlineCalendar
          year={year}
          month={month}
          tasks={tasks}
          projectsById={projectsById}
          membersById={membersById}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* Modal tạo/sửa công việc */}
      {formModal && (
        <TaskFormModal
          mode={formModal.mode}
          task={formModal.mode === "edit" ? formModal.task : undefined}
          projects={projects}
          members={members}
          otherTasks={tasks}
          onClose={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            loadTasks(currentFilters());
          }}
        />
      )}

      {/* Modal xem nhanh chi tiết task */}
      {quickView && (
        <TaskQuickViewModal
          task={quickView.task}
          project={projectsById.get(quickView.task.projectId)}
          assignee={membersById.get(quickView.task.assigneeId)}
          initialTab="info"
          onClose={() => setQuickView(null)}
          onReportAdded={() => loadTasks(currentFilters())}
        />
      )}
    </div>
  );
}
