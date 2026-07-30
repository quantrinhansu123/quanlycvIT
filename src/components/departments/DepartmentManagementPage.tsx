"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDownUp, ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft,
  ChevronsRight, Columns3, Download, LockKeyhole, Pencil,
  Plus, RefreshCw, Search, Trash2, UnlockKeyhole, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { departmentService } from "@/services/department-service";
import type { DepartmentInput, DepartmentRecord } from "@/types/department";

const DepartmentFormModal = dynamic(
  () => import("@/components/departments/DepartmentFormModal").then((mod) => mod.DepartmentFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

const PAGE_SIZES = [20, 50, 100];
type SortKey = "code" | "name" | "level" | "createdAt";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
}

function csvCell(value: string | number | undefined) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function asInput(department: DepartmentRecord): DepartmentInput {
  return {
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    level: department.level,
    positions: department.positions,
    positionStructure: department.positionStructure,
    description: department.description,
    status: department.status,
  };
}

export function DepartmentManagementPage() {
  const { notify, confirm } = useFeedback();
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "createdAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<DepartmentRecord | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      setDepartments(await departmentService.getAll());
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể tải danh sách phòng ban",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return departments
      .filter((department) =>
        !keyword ||
        [department.code, department.name, department.description, ...department.positions]
          .some((value) => value?.toLocaleLowerCase("vi").includes(keyword))
      )
      .sort((left, right) => {
        const a = left[sort.key];
        const b = right[sort.key];
        return String(a).localeCompare(String(b), "vi", { numeric: true }) *
          (sort.direction === "asc" ? 1 : -1);
      });
  }, [departments, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allVisibleSelected =
    visible.length > 0 && visible.every((department) => selected.includes(department.id));

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  async function save(input: DepartmentInput) {
    if (editing && editing !== "new") await departmentService.update(editing.id, input);
    else await departmentService.create(input);
    notify({
      type: "success",
      title: editing === "new" ? "Đã thêm phòng ban" : "Đã cập nhật phòng ban",
    });
    setEditing(null);
    await load();
  }

  async function remove(department: DepartmentRecord) {
    const approved = await confirm({
      title: `Xóa ${department.name}?`,
      description:
        department.employeeCount > 0
          ? `Phòng ban đang có ${department.employeeCount} nhân viên. Nhân viên sẽ được gỡ khỏi phòng ban này.`
          : "Phòng ban và danh sách chức vụ sẽ bị xóa khỏi hệ thống.",
      confirmLabel: "Xóa phòng ban",
    });
    if (!approved) return;

    try {
      await departmentService.delete(department.id);
      setSelected((current) => current.filter((id) => id !== department.id));
      notify({ type: "success", title: "Đã xóa phòng ban" });
      await load();
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể xóa phòng ban",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    }
  }

  async function toggleStatus(department: DepartmentRecord) {
    try {
      await departmentService.update(department.id, {
        ...asInput(department),
        status: department.status === "active" ? "inactive" : "active",
      });
      notify({
        type: "success",
        title: department.status === "active" ? "Đã ngừng hoạt động phòng ban" : "Đã kích hoạt phòng ban",
      });
      await load();
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể cập nhật trạng thái",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    }
  }

  function exportCsv() {
    const headers = ["Mã PB", "Tên phòng ban", "Cấp độ", "Chức vụ", "Mô tả", "Trạng thái", "Ngày tạo"];
    const rows = filtered.map((department) =>
      [
        department.code,
        department.name,
        department.level,
        department.positions.join("; "),
        department.description,
        department.status === "active" ? "Hoạt động" : "Ngừng hoạt động",
        department.createdAt.slice(0, 10),
      ].map(csvCell).join(",")
    );
    const blob = new Blob(
      ["\uFEFF" + [headers.map(csvCell).join(","), ...rows].join("\n")],
      { type: "text/csv;charset=utf-8" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `phong-ban-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("Tệp CSV không có dữ liệu.");
      const parse = (line: string) =>
        line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
          ?.map((cell) => cell.replace(/^"|"$/g, "").replaceAll('""', '"').trim()) ?? [];
      const headers = parse(lines[0]).map((header) => header.toLocaleLowerCase("vi"));
      const value = (row: string[], names: string[]) => {
        const index = headers.findIndex((header) => names.includes(header));
        return index >= 0 ? row[index] : "";
      };

      let imported = 0;
      for (const line of lines.slice(1)) {
        const row = parse(line);
        const code = value(row, ["mã pb", "ma pb", "code"]);
        const name = value(row, ["tên phòng ban", "ten phong ban", "name"]);
        if (!code || !name) continue;
        const positions = value(row, ["chức vụ", "chuc vu", "positions"])
          .split(/[;|]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        await departmentService.create({
          code,
          name,
          level: Number(value(row, ["cấp độ", "cap do", "level"])) || 1,
          positions,
          positionStructure: positions.map((position, index) => ({
            id: crypto.randomUUID(),
            name: position,
            level: index + 1,
          })),
          description: value(row, ["mô tả", "mo ta", "description"]) || undefined,
          status: "active",
        });
        imported++;
      }
      notify({ type: "success", title: `Đã nhập ${imported} phòng ban` });
      await load();
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể nhập CSV",
        description: getErrorMessage(error, "Tệp CSV không hợp lệ."),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
        <button
          type="button"
          onClick={() => history.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative min-w-[220px] max-w-[525px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm phòng ban, chức vụ..."
            className="h-9 w-full rounded-xl border border-gray-200 pl-9 pr-9 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button size="sm" className="h-9" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Thêm mới
          </Button>
          <button title="Tùy chỉnh cột" className="icon-button"><Columns3 className="h-4 w-4" /></button>
          <button title="Nhập CSV" onClick={() => fileRef.current?.click()} className="icon-button"><Upload className="h-4 w-4" /></button>
          <button title="Xuất CSV" onClick={exportCsv} className="icon-button"><Download className="h-4 w-4" /></button>
          <button title="Tải lại" onClick={() => void load()} className="icon-button">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importCsv(event)} />
        </div>
      </div>

      <div className="account-table-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1450px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold text-gray-700">
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-20 w-12 bg-gray-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() =>
                    setSelected((current) =>
                      allVisibleSelected
                        ? current.filter((id) => !visible.some((department) => department.id === id))
                        : [...new Set([...current, ...visible.map((department) => department.id)])]
                    )
                  }
                />
              </th>
              <SortTh label="Mã PB" column="code" sort={sort} onSort={toggleSort} width="135px" />
              <SortTh label="Tên phòng ban" column="name" sort={sort} onSort={toggleSort} width="210px" />
              <SortTh label="Cấp độ" column="level" sort={sort} onSort={toggleSort} width="120px" />
              <th className="min-w-[310px] px-4 py-3">Chức vụ</th>
              <th className="min-w-[340px] px-4 py-3">Mô tả</th>
              <th className="min-w-[135px] px-4 py-3">Trạng thái</th>
              <SortTh label="Ngày tạo" column="createdAt" sort={sort} onSort={toggleSort} width="140px" />
              <th className="sticky right-0 z-20 min-w-[145px] border-l border-gray-200 bg-gray-50 px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows />
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="py-24 text-center text-gray-400">Không tìm thấy phòng ban phù hợp.</td></tr>
            ) : (
              visible.map((department) => (
                <tr key={department.id} className="data-table-row group border-b border-gray-200">
                  <td className="sticky left-0 z-[2] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(department.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(department.id)
                            ? current.filter((id) => id !== department.id)
                            : [...current, department.id]
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-600">{department.code}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-900">{department.name}</p>
                    <p className="mt-1 text-[11px] text-gray-500">{department.employeeCount} nhân viên</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{department.level}</td>
                  <td className="px-4 py-2.5">
                    {department.positions.length ? (
                      <div className="flex flex-wrap gap-1">
                        {department.positions.map((position) => (
                          <span key={position} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-800">
                            {position}
                            <span className="text-gray-400">{department.positionCounts[position] ?? 0}</span>
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{department.description ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
                      department.status === "active" ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-600"
                    )}>
                      {department.status === "active" ? "Hoạt động" : "Ngừng hoạt động"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-600">{formatDate(department.createdAt)}</td>
                  <td className="sticky right-0 z-[2] border-l border-gray-100 px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <ActionIconButton
                        icon={Pencil}
                        label="Chỉnh sửa"
                        tone="warning"
                        onClick={() => setEditing(department)}
                      />
                      <ActionIconButton
                        icon={department.status === "active" ? LockKeyhole : UnlockKeyhole}
                        label={department.status === "active" ? "Ngừng hoạt động" : "Kích hoạt"}
                        onClick={() => void toggleStatus(department)}
                      />
                      <ActionIconButton
                        icon={Trash2}
                        label="Xóa phòng ban"
                        tone="danger"
                        onClick={() => void remove(department)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2.5 text-xs">
        <div className="flex items-center gap-3 text-gray-600">
          <span>Tổng: <b>{filtered.length}</b> bản ghi</span>
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="h-9 rounded-lg border border-gray-200 px-2 outline-none"
          >
            {PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}
          </select>
          <span>/ trang</span>
        </div>
        <div className="flex items-center gap-1">
          <PageButton onClick={() => setPage(1)} disabled={currentPage <= 1} icon={ChevronsLeft} />
          <PageButton onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} icon={ChevronLeft} />
          <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand-600 px-3 font-semibold text-white">{currentPage}</span>
          <span className="px-1 text-gray-600">/ {pageCount}</span>
          <PageButton onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount} icon={ChevronRight} />
          <PageButton onClick={() => setPage(pageCount)} disabled={currentPage >= pageCount} icon={ChevronsRight} />
        </div>
      </div>

      {editing && (
        <DepartmentFormModal
          department={editing === "new" ? undefined : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function SortTh({
  label,
  column,
  sort,
  onSort,
  width,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: string };
  onSort: (key: SortKey) => void;
  width?: string;
}) {
  return (
    <th style={{ minWidth: width }} className="px-4 py-3">
      <button type="button" onClick={() => onSort(column)} className="flex items-center gap-2 hover:text-brand-600">
        {label}
        <ArrowDownUp className={cn("h-3.5 w-3.5", sort.key === column && "text-brand-600")} />
      </button>
    </th>
  );
}

function PageButton({
  icon: Icon,
  ...props
}: { icon: React.ElementType } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function LoadingRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((row) => (
        <tr key={row} className="border-b border-gray-100">
          <td colSpan={9} className="px-4 py-3"><div className="h-10 animate-pulse rounded-lg bg-gray-100" /></td>
        </tr>
      ))}
    </>
  );
}
