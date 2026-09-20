"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Layers3,
  ListTodo,
  Network,
  RefreshCw,
  TrendingDown,
  Users2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import type { ProjectMember } from "@/types/project";
import type { DashboardData, InitialDashboardData } from "@/lib/dashboard-data";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_META,
  isTaskOverdue,
  type TaskPriority,
  type TaskStatus,
  type WorkTask,
} from "@/types/task";
import { cn, formatDateVN, shortName } from "@/lib/utils";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { CACHE_TTL } from "@/lib/client-cache/ttl";

const DAY_MS = 86_400_000;
const DASHBOARD_PROJECT_LIMIT = 100;
const DASHBOARD_TASK_LIMIT = 200;
const STATUS_ORDER: TaskStatus[] = ["todo", "inProgress", "review", "done"];
const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#94A3B8",
  inProgress: "#3B82F6",
  testing: "#8B5CF6",
  review: "#F59E0B",
  done: "#10B981",
};

type WorkloadItem = {
  member: ProjectMember;
  total: number;
  important: number;
  index: number;
};

type TimelinePoint = {
  date: Date;
  label: string;
};

async function fetchDashboardData(signal: AbortSignal): Promise<DashboardData> {
  const [projects, tasks, members] = await Promise.all([
    projectService.getProjectsPage(undefined, 1, DASHBOARD_PROJECT_LIMIT, undefined, {
      signal,
      lite: "dashboard",
    }),
    taskService.getTasksPage(
      { page: 1, pageSize: DASHBOARD_TASK_LIMIT },
      { signal, lite: "dashboard" }
    ),
    projectService.getDirectory({ signal }),
  ]);
  return {
    projects: projects.items,
    tasks: tasks.items,
    members,
    totalProjects: projects.total,
    totalTasks: tasks.total,
  };
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function taskHasMember(task: WorkTask, memberId: string): boolean {
  if (task.assigneeId === memberId) return true;
  return (task.assignees ?? []).some((assignee) => assignee.id === memberId);
}

function createTimeline(tasks: WorkTask[], count = 12): TimelinePoint[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const taskDates = tasks.flatMap((task) => [
    parseDate(task.startDate).getTime(),
    parseDate(task.dueDate).getTime(),
  ]);
  let startTime = taskDates.length > 0 ? Math.min(...taskDates) : now.getTime() - 30 * DAY_MS;
  let endTime = taskDates.length > 0 ? Math.max(...taskDates, now.getTime()) : now.getTime();
  if (endTime <= startTime) endTime = startTime + 7 * DAY_MS;
  if (endTime - startTime < (count - 1) * DAY_MS) {
    startTime = endTime - (count - 1) * DAY_MS;
  }

  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    const date = new Date(startTime + (endTime - startTime) * ratio);
    return {
      date,
      label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
    };
  });
}

const DashboardFilter = memo(function DashboardFilter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="group relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-brand-300 hover:shadow-md focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-hover:text-brand-500" />
    </label>
  );
});

const KpiCard = memo(function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: "slate" | "emerald" | "amber" | "blue" | "rose";
  onClick: () => void;
}) {
  const toneClasses = {
    slate: "bg-slate-100 text-slate-600 group-hover:bg-slate-700 group-hover:text-white",
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white",
    blue: "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-500 group-hover:text-white",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-[138px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
    >
      <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-brand-500 to-violet-500 transition-transform duration-300 group-hover:scale-x-100" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition duration-300 group-hover:rotate-3 group-hover:scale-110",
            toneClasses[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-slate-500 transition group-hover:text-slate-700">
        {description}
      </p>
    </button>
  );
});

function DashboardPanel({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:border-slate-300 hover:shadow-md",
        className
      )}
    >
      <header className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-bold text-slate-950">{title}</h2>
        </div>
        <p className="mt-1 text-xs font-medium text-slate-500">{description}</p>
      </header>
      {children}
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <CircleGauge className="mb-3 h-8 w-8 text-slate-300" />
      <p className="text-sm font-semibold text-slate-500">{message}</p>
      <p className="mt-1 text-xs text-slate-400">Hãy thay đổi bộ lọc để xem dữ liệu khác.</p>
    </div>
  );
}

const CumulativeFlowChart = memo(function CumulativeFlowChart({ tasks, timeline }: { tasks: WorkTask[]; timeline: TimelinePoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 960;
  const height = 300;
  const margin = { top: 18, right: 18, bottom: 45, left: 44 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const series = useMemo(() => STATUS_ORDER.map((status) => ({
    status,
    label: TASK_STATUS_META[status].label,
    color: STATUS_COLORS[status],
    values: timeline.map((point) =>
      tasks.filter(
        (task) =>
          task.status === status &&
          parseDate(task.startDate).getTime() <= point.date.getTime()
      ).length
    ),
  })), [tasks, timeline]);

  const totals = useMemo(() => timeline.map((_, index) =>
    series.reduce((sum, current) => sum + current.values[index], 0)
  ), [series, timeline]);
  const maxValue = Math.max(1, ...totals);
  const x = useCallback((index: number) =>
    44 + (timeline.length === 1 ? 0 : (index / (timeline.length - 1)) * innerWidth),
  [innerWidth, timeline.length]);
  const y = useCallback(
    (value: number) => 18 + innerHeight - (value / maxValue) * innerHeight,
    [innerHeight, maxValue]
  );

  const layers = useMemo(() => series.map((current, seriesIndex) => {
    const lower = timeline.map((_, pointIndex) =>
      series
        .slice(0, seriesIndex)
        .reduce((sum, previousSeries) => sum + previousSeries.values[pointIndex], 0)
    );
    const upper = current.values.map((value, index) => value + lower[index]);
    const upperPath = upper.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
    const lowerPath = lower
      .map((value, index) => ({ value, index }))
      .reverse()
      .map(({ value, index }) => `L ${x(index)} ${y(value)}`)
      .join(" ");
    return { ...current, path: `${upperPath} ${lowerPath} Z` };
  }), [series, timeline, x, y]);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = clamp((localX - margin.left) / innerWidth, 0, 1);
    setHoveredIndex(Math.round(ratio * (timeline.length - 1)));
  }

  if (tasks.length === 0) return <EmptyChart message="Chưa có công việc để tạo biểu đồ." />;

  return (
    <div className="relative p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[300px] w-full select-none"
        role="img"
        aria-label="Biểu đồ phân bổ công việc theo trạng thái"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const value = Math.round((maxValue / 4) * index);
          const gridY = y(value);
          return (
            <g key={index}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={gridY}
                y2={gridY}
                stroke="#E2E8F0"
                strokeDasharray="4 5"
              />
              <text x={margin.left - 12} y={gridY + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                {value}
              </text>
            </g>
          );
        })}
        {layers.map((layer) => (
          <path
            key={layer.status}
            d={layer.path}
            fill={layer.color}
            fillOpacity={layer.status === "todo" ? 0.45 : 0.7}
            stroke={layer.color}
            strokeWidth="1.5"
            className="transition-opacity duration-200 hover:opacity-80"
          />
        ))}
        {timeline.map((point, index) =>
          index % 2 === 0 || index === timeline.length - 1 ? (
            <text
              key={point.date.toISOString()}
              x={x(index)}
              y={height - 17}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {point.label}
            </text>
          ) : null
        )}
        {hoveredIndex !== null && (
          <line
            x1={x(hoveredIndex)}
            x2={x(hoveredIndex)}
            y1={margin.top}
            y2={margin.top + innerHeight}
            stroke="#2563EB"
            strokeDasharray="4 4"
          />
        )}
      </svg>

      {hoveredIndex !== null && (
        <div
          className="pointer-events-none absolute top-7 z-10 min-w-40 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur"
          style={{ left: `${clamp((x(hoveredIndex) / width) * 100, 13, 87)}%` }}
        >
          <p className="mb-2 font-bold text-slate-900">{formatDateVN(timeline[hoveredIndex].date.toISOString())}</p>
          <div className="space-y-1.5">
            {series.map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-5">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
                <strong>{item.values[hoveredIndex]}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        {series.map((item) => (
          <span key={item.status} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
});

const WorkloadChart = memo(function WorkloadChart({
  workloads,
  onSelect,
}: {
  workloads: WorkloadItem[];
  onSelect: (memberId: string) => void;
}) {
  const [hovered, setHovered] = useState<{ index: number; type: "total" | "important" } | null>(null);
  const visible = workloads.slice(0, 6);
  const width = 520;
  const height = 300;
  const margin = { top: 20, right: 14, bottom: 55, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...visible.map((item) => item.total));
  const bandWidth = visible.length > 0 ? innerWidth / visible.length : innerWidth;
  const barWidth = Math.min(30, bandWidth * 0.3);
  const y = (value: number) => margin.top + innerHeight - (value / maxValue) * innerHeight;

  if (visible.length === 0) return <EmptyChart message="Chưa có người phụ trách trong bộ lọc này." />;

  return (
    <div className="relative p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[300px] w-full select-none"
        role="img"
        aria-label="Biểu đồ tải công việc theo nhân sự"
      >
        {Array.from({ length: Math.min(5, maxValue + 1) }, (_, index) => {
          const value = Math.round((maxValue / Math.min(4, maxValue)) * index);
          const gridY = y(value);
          return (
            <g key={index}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={gridY}
                y2={gridY}
                stroke="#E2E8F0"
                strokeDasharray="4 5"
              />
              <text x={margin.left - 10} y={gridY + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                {value}
              </text>
            </g>
          );
        })}
        {visible.map((item, index) => {
          const center = margin.left + bandWidth * index + bandWidth / 2;
          const totalHeight = innerHeight - (y(item.total) - margin.top);
          const importantHeight = innerHeight - (y(item.important) - margin.top);
          return (
            <g
              key={item.member.id}
              className="cursor-pointer"
              onClick={() => onSelect(item.member.id)}
              role="button"
              aria-label={`Xem hồ sơ ${item.member.name}`}
            >
              <rect
                x={center - barWidth - 2}
                y={y(item.total)}
                width={barWidth}
                height={totalHeight}
                rx="5"
                fill="#3B82F6"
                className="transition-opacity hover:opacity-80"
                onMouseEnter={() => setHovered({ index, type: "total" })}
                onMouseLeave={() => setHovered(null)}
              />
              <rect
                x={center + 2}
                y={y(item.important)}
                width={barWidth}
                height={importantHeight}
                rx="5"
                fill="#F59E0B"
                className="transition-opacity hover:opacity-80"
                onMouseEnter={() => setHovered({ index, type: "important" })}
                onMouseLeave={() => setHovered(null)}
              />
              <text x={center} y={height - 23} textAnchor="middle" className="fill-slate-600 text-[11px] font-semibold">
                {shortName(item.member.name)}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-8 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${clamp(
              ((margin.left + bandWidth * hovered.index + bandWidth / 2) / width) * 100,
              18,
              82
            )}%`,
          }}
        >
          <p className="font-bold text-slate-900">{visible[hovered.index].member.name}</p>
          <p className="mt-1 text-slate-500">
            {hovered.type === "total" ? "Tổng việc đang mở" : "Việc quan trọng"}:{" "}
            <strong className="text-slate-900">
              {hovered.type === "total"
                ? visible[hovered.index].total
                : visible[hovered.index].important}
            </strong>
          </p>
        </div>
      )}

      <div className="flex justify-center gap-5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-600">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          Tổng việc
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Việc quan trọng
        </span>
      </div>
    </div>
  );
});

const BurndownChart = memo(function BurndownChart({ tasks, timeline }: { tasks: WorkTask[]; timeline: TimelinePoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 960;
  const height = 300;
  const margin = { top: 18, right: 18, bottom: 45, left: 44 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const total = tasks.length;
  const ideal = useMemo(() => timeline.map((_, index) =>
    Math.max(0, total * (1 - index / Math.max(1, timeline.length - 1)))
  ), [timeline, total]);
  const actual = useMemo(() => timeline.map((point) => {
    const completed = tasks.filter(
      (task) => task.status === "done" && parseDate(task.dueDate).getTime() <= point.date.getTime()
    ).length;
    return total - completed;
  }), [tasks, timeline, total]);
  const maxValue = Math.max(1, total);
  const x = useCallback((index: number) =>
    44 + (timeline.length === 1 ? 0 : (index / (timeline.length - 1)) * innerWidth),
  [innerWidth, timeline.length]);
  const y = useCallback(
    (value: number) => 18 + innerHeight - (value / maxValue) * innerHeight,
    [innerHeight, maxValue]
  );
  const idealPath = useMemo(
    () => ideal.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" "),
    [ideal, x, y]
  );
  const actualPath = useMemo(
    () => actual.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" "),
    [actual, x, y]
  );

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = clamp((localX - margin.left) / innerWidth, 0, 1);
    setHoveredIndex(Math.round(ratio * (timeline.length - 1)));
  }

  if (tasks.length === 0) return <EmptyChart message="Chưa có công việc để tạo biểu đồ." />;

  return (
    <div className="relative p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[300px] w-full select-none"
        role="img"
        aria-label="Biểu đồ burn-down công việc"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const value = (maxValue / 4) * index;
          const gridY = y(value);
          return (
            <g key={index}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={gridY}
                y2={gridY}
                stroke="#E2E8F0"
                strokeDasharray="4 5"
              />
              <text x={margin.left - 12} y={gridY + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        <path d={idealPath} fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeDasharray="7 6" />
        <path d={actualPath} fill="none" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {timeline.map((point, index) =>
          index % 2 === 0 || index === timeline.length - 1 ? (
            <text
              key={point.date.toISOString()}
              x={x(index)}
              y={height - 17}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {point.label}
            </text>
          ) : null
        )}
        {hoveredIndex !== null && (
          <>
            <line
              x1={x(hoveredIndex)}
              x2={x(hoveredIndex)}
              y1={margin.top}
              y2={margin.top + innerHeight}
              stroke="#2563EB"
              strokeDasharray="4 4"
            />
            <circle cx={x(hoveredIndex)} cy={y(actual[hoveredIndex])} r="5" fill="#2563EB" stroke="white" strokeWidth="2" />
          </>
        )}
      </svg>

      {hoveredIndex !== null && (
        <div
          className="pointer-events-none absolute top-7 z-10 min-w-40 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur"
          style={{ left: `${clamp((x(hoveredIndex) / width) * 100, 13, 87)}%` }}
        >
          <p className="font-bold text-slate-900">{formatDateVN(timeline[hoveredIndex].date.toISOString())}</p>
          <p className="mt-2 flex justify-between gap-5 text-slate-500">
            Lý tưởng <strong className="text-slate-900">{ideal[hoveredIndex].toFixed(1)}</strong>
          </p>
          <p className="mt-1 flex justify-between gap-5 text-brand-600">
            Thực tế <strong>{actual[hoveredIndex]}</strong>
          </p>
        </div>
      )}

      <div className="flex justify-center gap-5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          Lý tưởng
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-600">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
          Thực tế
        </span>
      </div>
    </div>
  );
});

export function PerformanceDashboard({ initialData }: { initialData: InitialDashboardData }) {
  const router = useRouter();
  const { accountId, accountRole, ...dashboardInitialData } = initialData;
  const dashboardKey = buildCacheKey({
    accountId,
    role: accountRole,
    resource: CACHE_RESOURCE.dashboard,
  });
  const dashboardQuery = useSessionQuery({
    key: dashboardKey,
    fetcher: fetchDashboardData,
    ttl: CACHE_TTL.dashboard,
    initialData: dashboardInitialData,
  });
  const data = dashboardQuery.data ?? dashboardInitialData;
  const [projectId, setProjectId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");

  const projectOptions = useMemo(() => data.projects.map((project) => ({
    value: project.id,
    label: `${project.code} · ${project.name}`,
  })), [data.projects]);
  const memberOptions = useMemo(() => data.members.map((member) => ({
    value: member.id,
    label: member.name,
  })), [data.members]);
  const handlePriorityChange = useCallback(
    (value: string) => setPriority(value as TaskPriority | ""),
    []
  );
  const openTaskList = useCallback(
    () => router.push("/quan-ly-cong-viec/danh-sach-cong-viec"),
    [router]
  );
  const openEmployeeList = useCallback(() => router.push("/nhan-vien"), [router]);
  const openGantt = useCallback(
    () => router.push("/quan-ly-cong-viec/bieu-do-gantt"),
    [router]
  );
  const openEmployee = useCallback(
    (selectedMemberId: string) => router.push(`/nhan-vien/${selectedMemberId}`),
    [router]
  );

  const filteredTasks = useMemo(() => {
    return data.tasks.filter((task) => {
      if (projectId && task.projectId !== projectId) return false;
      if (memberId && !taskHasMember(task, memberId)) return false;
      if (priority && task.priority !== priority) return false;
      return true;
    });
  }, [data, memberId, priority, projectId]);

  const visibleProjects = useMemo(() => {
    if (projectId) return data.projects.filter((project) => project.id === projectId);
    if (memberId || priority) {
      const projectIds = new Set(filteredTasks.map((task) => task.projectId));
      return data.projects.filter((project) => projectIds.has(project.id));
    }
    return data.projects;
  }, [data, filteredTasks, memberId, priority, projectId]);

  const timeline = useMemo(() => createTimeline(filteredTasks), [filteredTasks]);

  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const done = filteredTasks.filter((task) => task.status === "done").length;
    const open = total - done;
    const importantOpen = filteredTasks.filter(
      (task) => task.status !== "done" && (task.priority === "high" || task.priority === "urgent")
    ).length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const openByStatus = STATUS_ORDER.filter((status) => status !== "done").map((status) => ({
      status,
      count: filteredTasks.filter((task) => task.status === status).length,
    }));
    const bottleneck = openByStatus.sort((a, b) => b.count - a.count)[0] ?? {
      status: "todo" as TaskStatus,
      count: 0,
    };
    return {
      total,
      done,
      open,
      importantOpen,
      completionRate,
      bottleneck,
      burndownGap: open,
    };
  }, [filteredTasks]);

  const workloads = useMemo<WorkloadItem[]>(() => {
    const totals = new Map<string, number>();
    const importantCounts = new Map<string, number>();
    for (const task of filteredTasks) {
      if (task.status === "done") continue;
      const memberIds = new Set<string>();
      if (task.assigneeId) memberIds.add(task.assigneeId);
      for (const assignee of task.assignees ?? []) memberIds.add(assignee.id);
      const isImportant = task.priority === "high" || task.priority === "urgent";
      for (const memberId of memberIds) {
        totals.set(memberId, (totals.get(memberId) ?? 0) + 1);
        if (isImportant) {
          importantCounts.set(memberId, (importantCounts.get(memberId) ?? 0) + 1);
        }
      }
    }
    return data.members
      .map((member) => {
        const total = totals.get(member.id) ?? 0;
        const important = importantCounts.get(member.id) ?? 0;
        return {
          member,
          total,
          important,
          index: Number((total + important * 1.8).toFixed(1)),
        };
      })
      .filter((item) => item.total > 0)
      .sort((a, b) => b.index - a.index);
  }, [data, filteredTasks]);

  const overloadCount = workloads.filter((item) => item.important > 5).length;

  const statusHealth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return STATUS_ORDER.filter((status) => status !== "done")
      .map((status) => {
        const tasks = filteredTasks.filter((task) => task.status === status);
        const averageAge =
          tasks.length > 0
            ? Math.round(
                tasks.reduce((sum, task) => sum + daysBetween(parseDate(task.startDate), today), 0) /
                  tasks.length
              )
            : 0;
        return { status, count: tasks.length, averageAge };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredTasks]);

  const projectHealth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasksByProject = new Map<string, WorkTask[]>();
    for (const task of filteredTasks) {
      const list = tasksByProject.get(task.projectId);
      if (list) list.push(task);
      else tasksByProject.set(task.projectId, [task]);
    }
    return visibleProjects
      .map((project) => {
        const tasks = tasksByProject.get(project.id) ?? [];
        const done = tasks.filter((task) => task.status === "done").length;
        const overdue = tasks.filter((task) => isTaskOverdue(task, new Date(today))).length;
        const progress =
          tasks.length > 0
            ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
            : 0;
        const start = parseDate(project.startDate);
        const end = parseDate(project.endDate);
        const duration = Math.max(1, daysBetween(start, end));
        const elapsed = daysBetween(start, today);
        const ideal = clamp(Math.round((elapsed / duration) * 100), 0, 100);
        const risk = overdue > 0 || progress + 15 < ideal;
        return { project, tasks, done, overdue, progress, ideal, risk };
      })
      .sort((a, b) => Number(b.risk) - Number(a.risk) || b.overdue - a.overdue)
      .slice(0, 5);
  }, [filteredTasks, visibleProjects]);

  if (dashboardQuery.status === "error") {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-lg">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">Dashboard chưa thể hiển thị</h1>
          <p className="mt-2 text-sm text-slate-500">Không thể tải dữ liệu dashboard. Vui lòng thử lại.</p>
          <button
            type="button"
            onClick={dashboardQuery.refresh}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
          >
            <RefreshCw className="h-4 w-4" />
            Tải lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-950">Dashboard hiệu suất dự án</h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Theo dõi tiến độ, khối lượng và rủi ro từ dữ liệu công việc thực tế.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-[620px]">
          <DashboardFilter
            value={projectId}
            onChange={setProjectId}
            label="Tất cả dự án"
            options={projectOptions}
          />
          <DashboardFilter
            value={memberId}
            onChange={setMemberId}
            label="Tất cả nhân sự"
            options={memberOptions}
          />
          <DashboardFilter
            value={priority}
            onChange={handlePriorityChange}
            label="Tất cả độ ưu tiên"
            options={TASK_PRIORITY_OPTIONS}
          />
        </div>
      </div>

      <div className="space-y-4 animate-in fade-in duration-500">
          {(data.totalProjects > data.projects.length || data.totalTasks > data.tasks.length) && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Dashboard đang phân tích tối đa {DASHBOARD_PROJECT_LIMIT} dự án và {DASHBOARD_TASK_LIMIT} công việc mới nhất để tải nhanh hơn. Xem danh sách đầy đủ ở các màn hình quản lý.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="Tổng công việc"
              value={String(metrics.total)}
              description={`${metrics.done} hoàn thành, ${metrics.open} đang mở`}
              icon={Layers3}
              tone="slate"
              onClick={openTaskList}
            />
            <KpiCard
              title="Tỉ lệ xong"
              value={`${metrics.completionRate}%`}
              description={`${metrics.done}/${metrics.total || 0} công việc đã hoàn thành`}
              icon={CheckCircle2}
              tone="emerald"
              onClick={openTaskList}
            />
            <KpiCard
              title="Nút thắt"
              value={String(metrics.bottleneck.count)}
              description={TASK_STATUS_META[metrics.bottleneck.status].label}
              icon={Network}
              tone="amber"
              onClick={openTaskList}
            />
            <KpiCard
              title="Quá tải"
              value={String(overloadCount)}
              description={`${metrics.importantOpen} việc quan trọng đang mở`}
              icon={Users2}
              tone="blue"
              onClick={openEmployeeList}
            />
            <KpiCard
              title="Burn-down"
              value={`+${metrics.burndownGap}`}
              description="Công việc còn lại so với đích hoàn thành"
              icon={TrendingDown}
              tone="rose"
              onClick={openGantt}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <DashboardPanel
              title="Cumulative Flow Diagram"
              description="Phân bổ công việc theo trạng thái và thời điểm bắt đầu"
              icon={ListTodo}
              className="xl:col-span-2"
            >
              <CumulativeFlowChart tasks={filteredTasks} timeline={timeline} />
            </DashboardPanel>

            <DashboardPanel
              title="Workload Index"
              description="Ngưỡng cảnh báo: trên 5 công việc quan trọng"
              icon={CircleGauge}
            >
              <WorkloadChart
                workloads={workloads}
                onSelect={openEmployee}
              />
            </DashboardPanel>

            <DashboardPanel
              title="Burn-down Chart"
              description="Công việc còn lại so với đường tiến trình lý tưởng"
              icon={ArrowDownRight}
              className="xl:col-span-2"
            >
              <BurndownChart tasks={filteredTasks} timeline={timeline} />
            </DashboardPanel>

            <DashboardPanel
              title="Cảnh báo tải"
              description="Nhân sự có chỉ số tải công việc cao nhất"
              icon={AlertTriangle}
            >
              <div className="space-y-2 p-4">
                {workloads.length === 0 ? (
                  <div className="flex min-h-[300px] items-center justify-center text-center text-xs font-medium text-slate-400">
                    Chưa có nhân sự đang phụ trách công việc.
                  </div>
                ) : (
                  workloads.slice(0, 6).map((item, index) => (
                    <button
                      key={item.member.id}
                      type="button"
                      onClick={() => router.push(`/nhan-vien/${item.member.id}`)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                    >
                      <Avatar name={item.member.name} color={item.member.avatarColor} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">
                          {item.member.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                          {item.total} đang mở · {item.important} quan trọng · index {item.index}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-bold",
                          index === 0
                            ? "bg-rose-100 text-rose-600"
                            : index === 1
                              ? "bg-amber-100 text-amber-600"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {index + 1}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Sức khỏe dự án"
              description="Tiến độ thực tế, tiến độ lý tưởng và công việc trễ hạn"
              icon={BriefcaseBusiness}
              className="xl:col-span-2"
            >
              <div className="space-y-3 p-4">
                {projectHealth.length === 0 ? (
                  <div className="flex min-h-40 items-center justify-center text-xs font-medium text-slate-400">
                    Không có dự án phù hợp với bộ lọc.
                  </div>
                ) : (
                  projectHealth.map(({ project, tasks, done, overdue, progress, ideal, risk }) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => router.push(`/quan-ly-cong-viec/danh-sach-du-an/${project.id}`)}
                      className="group w-full rounded-xl border border-slate-200 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                          {project.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-950 group-hover:text-brand-700">
                          {project.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[10px] font-bold",
                            risk ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                          )}
                        >
                          {risk ? "Rủi ro" : "Ổn định"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-slate-500">
                        <span>
                          {done}/{tasks.length} công việc xong
                        </span>
                        <span>·</span>
                        <span>Lý tưởng {ideal}%</span>
                        <span>·</span>
                        <span className={overdue > 0 ? "text-rose-600" : ""}>{overdue} trễ</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400 transition-all duration-700 group-hover:from-violet-600 group-hover:to-brand-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <strong className="w-9 text-right text-xs text-slate-900">{progress}%</strong>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </DashboardPanel>

            <DashboardPanel
              title="Nút thắt trạng thái"
              description="Công việc mở và tuổi trung bình theo trạng thái"
              icon={Network}
            >
              <div className="space-y-2 p-4">
                {statusHealth.map((item) => (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => router.push("/quan-ly-cong-viec/danh-sach-cong-viec")}
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
                  >
                    <span
                      className="h-9 w-1.5 rounded-full transition group-hover:scale-y-110"
                      style={{ backgroundColor: STATUS_COLORS[item.status] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900 group-hover:text-brand-700">
                        {TASK_STATUS_META[item.status].label}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        {item.averageAge} ngày tuổi trung bình
                      </span>
                    </span>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </DashboardPanel>
          </div>
      </div>
    </div>
  );
}
