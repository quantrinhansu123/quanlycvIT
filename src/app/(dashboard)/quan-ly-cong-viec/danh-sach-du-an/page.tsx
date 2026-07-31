"use client";

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Download, LayoutGrid, Plus, Search, Table as TableIcon, FolderOpen } from "lucide-react";
import { projectService } from "@/services/project-service";
import type { Project, ProjectInput, ProjectMember } from "@/types/project";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ProjectTable } from "@/components/projects/ProjectTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { exportTablePdf } from "@/lib/pdf-export";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";

const ProjectFormModal = dynamic(
  () => import("@/components/projects/ProjectFormModal").then((mod) => mod.ProjectFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type ViewMode = "table" | "grid";
type ModalState = { mode: "create" } | { mode: "edit"; project: Project } | null;
type ProjectOptimisticAction = { project: Project; visible: boolean; insert: boolean };

function matchesProjectSearch(project: Project, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();
  return !term || project.name.toLocaleLowerCase().includes(term) || project.code.toLocaleLowerCase().includes(term);
}

function buildOptimisticProject(
  input: ProjectInput,
  members: ProjectMember[],
  existing?: Project
): Project {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const managers = input.managerIds
    .map((id) => membersById.get(id))
    .filter((member): member is ProjectMember => Boolean(member));
  const projectMembers = input.memberIds
    .filter((id) => !input.managerIds.includes(id))
    .map((id) => membersById.get(id))
    .filter((member): member is ProjectMember => Boolean(member));
  const today = new Date().toISOString().slice(0, 10);
  const status = existing?.stats.total && existing.stats.done === existing.stats.total
    ? "done"
    : input.endDate < today
      ? "overdue"
      : input.startDate > today
        ? "notStarted"
        : "inProgress";

  return {
    id: existing?.id ?? `optimistic-project-${crypto.randomUUID()}`,
    code: input.code,
    name: input.name,
    description: input.description,
    color: input.color,
    steps: input.steps,
    startDate: input.startDate,
    endDate: input.endDate,
    status,
    managers,
    manager: managers[0] ?? existing?.manager ?? { id: "", name: "Chưa phân công", avatarColor: "#9CA3AF" },
    members: projectMembers,
    stats: existing?.stats ?? { total: 0, done: 0, inProgress: 0, overdue: 0 },
    files: input.files,
    links: input.links,
    images: input.images,
  };
}

export default function ProjectListPage() {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const { account, loading: accountLoading } = useCurrentAccount();
  const readOnly = accountLoading || account?.role === "member";
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();
  const [optimisticProjects, addOptimisticProject] = useOptimistic(
    projects,
    (current, action: ProjectOptimisticAction) => {
      if (!action.visible) return current.filter((project) => project.id !== action.project.id);
      const exists = current.some((project) => project.id === action.project.id);
      if (exists) {
        return current.map((project) => project.id === action.project.id ? action.project : project);
      }
      return action.insert ? [action.project, ...current].slice(0, pageSize) : current;
    }
  );

  const loadProjects = useCallback(async (query: string | undefined, targetPage: number, size: number) => {
    setLoading(true);
    setError(false);
    try {
      const result = await projectService.getProjectsPage(query, targetPage, size);
      setProjects(result.items);
      setTotal(result.total);
      setSelectedIds([]);
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải danh sách dự án",
        description: getErrorMessage(loadError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (accountLoading || account?.role === "member") return;
    projectService.getDirectory().then(setMembers).catch((directoryError) => {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải danh sách nhân sự",
        description: getErrorMessage(directoryError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    });
  }, [account?.role, accountLoading, notify]);

  useEffect(() => {
    // Tìm kiếm thay đổi thì quay về trang đầu để không rơi vào trang trống.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProjects(search, page, pageSize);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, page, pageSize, loadProjects]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = optimisticProjects.map((project) => project.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );
  }

  async function handleDelete(project: Project) {
    if (deletingId) return;
    const confirmed = await confirm({
      title: "Xóa dự án?",
      description: `Dự án “${project.name}” và dữ liệu liên quan sẽ bị xóa. Hành động này không thể hoàn tác.`,
      confirmLabel: "Xóa dự án",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeletingId(project.id);
    try {
      const deleted = await projectService.deleteProject(project.id);
      if (!deleted) throw new Error("Dự án không tồn tại hoặc đã được xóa trước đó.");
      notify({ type: "success", title: "Đã xóa dự án", description: `Dự án “${project.name}” đã được xóa.` });
      await loadProjects(search, page, pageSize);
    } catch (deleteError) {
      notify({
        type: "error",
        title: "Xóa dự án thất bại",
        description: getErrorMessage(deleteError, "Không thể xóa dự án. Vui lòng thử lại."),
      });
    } finally {
      setDeletingId(null);
    }
  }

  function saveProject(input: ProjectInput): Promise<Project> {
    const existing = modalState?.mode === "edit" ? modalState.project : undefined;
    const optimisticProject = buildOptimisticProject(input, members, existing);
    const wasVisible = existing ? matchesProjectSearch(existing, search) : false;
    const willBeVisible = matchesProjectSearch(optimisticProject, search);

    return new Promise((resolve, reject) => {
      startTransition(async () => {
        addOptimisticProject({
          project: optimisticProject,
          visible: willBeVisible,
          insert: !existing && page === 1,
        });
        try {
          const saved = existing
            ? await projectService.updateProject(existing.id, input)
            : await projectService.createProject(input);
          if (!saved) throw new Error("Không tìm thấy dự án để cập nhật.");

          const isVisible = matchesProjectSearch(saved, search);
          setProjects((current) => {
            if (!isVisible) return current.filter((project) => project.id !== saved.id);
            const exists = current.some((project) => project.id === saved.id);
            if (exists) return current.map((project) => project.id === saved.id ? saved : project);
            return !existing && page === 1 ? [saved, ...current].slice(0, pageSize) : current;
          });
          if (wasVisible !== isVisible || (!existing && isVisible)) {
            setTotal((current) => current + (isVisible ? 1 : -1));
          }
          resolve(saved);
        } catch (saveError) {
          reject(saveError);
        }
      });
    });
  }

  async function handleExportPdf() {
    try {
      const exportProjects = await projectService.getProjects(search);
      const rows = exportProjects.map((project) => [
        project.code,
        project.name,
        project.managers.map((manager) => manager.name).join("; "),
        formatDateVN(project.startDate),
        formatDateVN(project.endDate),
      ]);
      await exportTablePdf({
        title: "Danh sách dự án",
        filename: "danh-sach-du-an.pdf",
        columns: [
          { label: "Mã dự án", width: 62 }, { label: "Tên dự án", width: "*" },
          { label: "Quản lý (PM)", width: 100 }, { label: "Bắt đầu", width: 58, alignment: "center" },
          { label: "Kết thúc", width: 58, alignment: "center" },
        ],
        rows,
      });
      notify({ type: "success", title: "Đã xuất danh sách dự án PDF", description: `${exportProjects.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất PDF thất bại",
        description: getErrorMessage(exportError, "Không thể tạo PDF danh sách dự án."),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="relative min-w-[220px] max-w-[525px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm dự án..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!readOnly && <Button size="sm" onClick={() => setModalState({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>}
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex h-9 w-9 items-center justify-center ${
                viewMode === "table" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"
              }`}
              aria-label="Xem dạng bảng"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`flex h-9 w-9 items-center justify-center border-l border-gray-200 ${
                viewMode === "grid" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"
              }`}
              aria-label="Xem dạng lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          {!readOnly && <button
            type="button"
            onClick={() => void handleExportPdf()}
            title="Xuất PDF"
            disabled={total === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất PDF"
          >
            <Download className="h-4 w-4" />
          </button>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : error ? (
          <ErrorState onRetry={() => loadProjects(search, page, pageSize)} />
        ) : optimisticProjects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Không tìm thấy dự án nào"
            description="Thử thay đổi từ khóa tìm kiếm hoặc tạo dự án mới."
            action={!readOnly ? (
              <Button size="sm" onClick={() => setModalState({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm dự án
              </Button>
            ) : undefined}
          />
        ) : viewMode === "table" ? (
          <ProjectTable
            projects={optimisticProjects}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onEdit={(project) => setModalState({ mode: "edit", project })}
            onDelete={handleDelete}
            readOnly={readOnly}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {optimisticProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={(p) => setModalState({ mode: "edit", project: p })}
                onDelete={handleDelete}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
        </div>

        {!loading && !error && (
          <ListPaginationFooter
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {modalState && !readOnly && (
        <ProjectFormModal
          mode={modalState.mode}
          project={modalState.mode === "edit" ? modalState.project : undefined}
          members={members}
          onClose={() => setModalState(null)}
          onSave={saveProject}
        />
      )}
    </div>
  );
}
