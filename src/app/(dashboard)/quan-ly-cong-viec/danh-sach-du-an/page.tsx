"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, LayoutGrid, Plus, Search, Table as TableIcon, FolderOpen } from "lucide-react";
import { projectService } from "@/services/project-service";
import type { Project, ProjectMember } from "@/types/project";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ProjectTable } from "@/components/projects/ProjectTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { ListPaginationFooter } from "@/components/ui/ListPaginationFooter";

type ViewMode = "table" | "grid";
type ModalState = { mode: "create" } | { mode: "edit"; project: Project } | null;

export default function ProjectListPage() {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [projects, setProjects] = useState<Project[]>([]);
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
  const pageCount = Math.max(1, Math.ceil(projects.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProjects = useMemo(
    () => projects.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, pageSize, projects]
  );

  const loadProjects = useCallback(async (query?: string) => {
    setLoading(true);
    setError(false);
    try {
      const data = await projectService.getProjects(query);
      setProjects(data);
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
    projectService.getDirectory().then(setMembers).catch((directoryError) => {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải danh sách nhân sự",
        description: getErrorMessage(directoryError, "Vui lòng kiểm tra kết nối và thử lại."),
      });
    });
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProjects(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadProjects]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = visibleProjects.map((project) => project.id);
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
      await loadProjects(search);
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

  function handleExportCsv() {
    try {
      const header = ["Mã dự án", "Tên dự án", "Quản lý (PM)", "Ngày bắt đầu", "Ngày kết thúc"];
    const rows = projects.map((project) => [
      project.code,
      project.name,
      project.managers.map((manager) => manager.name).join("; "),
      formatDateVN(project.startDate),
      formatDateVN(project.endDate),
    ]);
    const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "danh-sach-du-an.csv";
    link.click();
    URL.revokeObjectURL(url);
      notify({ type: "success", title: "Đã xuất danh sách dự án", description: `${projects.length} bản ghi đã được xuất.` });
    } catch (exportError) {
      notify({
        type: "error",
        title: "Xuất file thất bại",
        description: getErrorMessage(exportError, "Không thể tạo file danh sách dự án."),
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
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => setModalState({ mode: "create" })}>
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>
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
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={projects.length === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Xuất file"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : error ? (
          <ErrorState onRetry={() => loadProjects(search)} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Không tìm thấy dự án nào"
            description="Thử thay đổi từ khóa tìm kiếm hoặc tạo dự án mới."
            action={
              <Button size="sm" onClick={() => setModalState({ mode: "create" })}>
                <Plus className="h-4 w-4" />
                Thêm dự án
              </Button>
            }
          />
        ) : viewMode === "table" ? (
          <ProjectTable
            projects={visibleProjects}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onEdit={(project) => setModalState({ mode: "edit", project })}
            onDelete={handleDelete}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={(p) => setModalState({ mode: "edit", project: p })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
        </div>

        {!loading && !error && (
          <ListPaginationFooter
            total={projects.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {modalState && (
        <ProjectFormModal
          mode={modalState.mode}
          project={modalState.mode === "edit" ? modalState.project : undefined}
          members={members}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            loadProjects(search);
          }}
        />
      )}
    </div>
  );
}
