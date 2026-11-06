"use client";

import { useEffect, useMemo, useState } from "react";
import { Kanban, RefreshCw, Search } from "lucide-react";
import { DetailKanbanBoard } from "@/components/kanban/DetailKanbanBoard";
import { SearchableFilterSelect } from "@/components/ui/SearchableFilterSelect";
import { MemberFilterMultiSelect } from "@/components/ui/MemberFilterMultiSelect";
import { ErrorState } from "@/components/ui/ErrorState";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { getErrorMessage } from "@/lib/errors";
import { apiClient } from "@/services/api-client";
import { projectService } from "@/services/project-service";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import type { KanbanDetailItem } from "@/types/kanban-detail";
import type { AcceptanceStatus } from "@/types/subtask";

export function KanbanDetailClient({ accountId, accountRole, initialItems }: {
  accountId: string;
  accountRole: "admin" | "manager" | "member";
  initialItems: KanbanDetailItem[];
}) {
  const { notify } = useFeedback();
  const cache = useSessionDataCache();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const listKey = buildCacheKey({ accountId, role: accountRole, resource: CACHE_RESOURCE.subtasksList, filters: { kanbanItems: true } });
  const { data, status, error, refresh, setData } = useSessionQuery<KanbanDetailItem[]>({
    key: listKey,
    fetcher: (signal) => apiClient.get<KanbanDetailItem[]>("/subtasks/kanban", { signal }),
    ttl: CACHE_TTL.list,
    initialData: initialItems,
  });
  const projectsKey = buildCacheKey({ accountId, role: accountRole, resource: CACHE_RESOURCE.directoryProjects });
  const { data: projects } = useSessionQuery<ProjectDirectoryItem[]>({
    key: projectsKey,
    fetcher: (signal) => projectService.getProjectDirectory({ signal }),
    ttl: CACHE_TTL.directory,
  });
  const membersKey = buildCacheKey({ accountId, role: accountRole, resource: CACHE_RESOURCE.directoryMembers });
  const { data: members } = useSessionQuery<ProjectMember[]>({
    key: accountRole === "member" ? null : membersKey,
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLocaleLowerCase("vi")), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const items = useMemo(() => (data ?? []).filter((item) =>
    (!search || `${item.title} ${item.taskTitle} ${item.workTaskTitle}`.toLocaleLowerCase("vi").includes(search)) &&
    (!projectId || item.projectId === projectId) &&
    (!assigneeIds.length || item.assigneeIds.some((id) => assigneeIds.includes(id)))
  ), [data, search, projectId, assigneeIds]);

  async function move(item: KanbanDetailItem, newStatus: AcceptanceStatus) {
    if (movingId || item.status === newStatus) return;
    setMovingId(item.id);
    setData((previous) => (previous ?? []).map((entry) => entry.id === item.id ? { ...entry, status: newStatus } : entry));
    try {
      await apiClient.patch(`/subtasks/${item.taskId}/kanban-items/${encodeURIComponent(item.itemId)}`, {
        detailId: item.detailId, status: newStatus,
      });
      cache.invalidate(CACHE_RESOURCE.subtasksList, listKey);
    } catch (reason) {
      refresh();
      notify({ type: "error", title: "Không thể chuyển công việc con", description: getErrorMessage(reason, "Vui lòng thử lại.") });
    } finally {
      setMovingId(null);
    }
  }

  return <div className="flex h-full min-h-0 flex-col bg-gray-50">
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
      <div className="mr-auto flex items-center gap-2">
        <Kanban className="h-5 w-5 text-brand-600" />
        <h1 className="text-base font-bold text-gray-900">Bảng Kanban · Công việc con trong Task</h1>
      </div>
      <div className="relative w-full max-w-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Tìm công việc con..." aria-label="Tìm công việc con"
          className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-xs outline-none focus:border-brand-400" />
      </div>
      <SearchableFilterSelect className="w-36" label="Dự án" searchPlaceholder="Tìm dự án..."
        value={projectId} onChange={setProjectId} options={(projects ?? []).map((project) => ({ value: project.id, label: project.name, sublabel: project.code }))} />
      {accountRole !== "member" && <MemberFilterMultiSelect className="w-40" label="Người phụ trách"
        value={assigneeIds} onChange={setAssigneeIds} options={members ?? []} />}
      <button type="button" onClick={refresh} aria-label="Làm mới Kanban" title="Làm mới"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
    {status === "loading" ? <p className="p-10 text-center text-sm text-gray-500">Đang tải Kanban...</p>
      : status === "error" ? <ErrorState onRetry={refresh} />
      : <div className="min-h-0 flex-1 overflow-hidden">
          {Boolean(error) && <p role="alert" className="bg-amber-50 px-4 py-2 text-xs text-amber-700">Không thể cập nhật dữ liệu mới. Đang hiển thị dữ liệu trước đó.</p>}
          <DetailKanbanBoard items={items} movingId={movingId} onMove={(item, next) => void move(item, next)} />
        </div>}
  </div>;
}
