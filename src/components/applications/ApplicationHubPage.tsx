"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Ban,
  Building2,
  CalendarDays,
  CalendarOff,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  GanttChartSquare,
  Layers3,
  ListChecks,
  ListTodo,
  Map,
  Network,
  PackageSearch,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Timer,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ModuleGroupId = "employees" | "attendance" | "work" | "system";

interface ApplicationModule {
  id: string;
  groupId: ModuleGroupId;
  name: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  background: string;
}

interface ModuleGroup {
  id: ModuleGroupId;
  name: string;
  icon: React.ElementType;
  iconColor: string;
}

const GROUPS: ModuleGroup[] = [
  { id: "employees", name: "Nhân viên", icon: UsersRound, iconColor: "text-violet-600" },
  { id: "attendance", name: "Quản lý công", icon: CalendarDays, iconColor: "text-cyan-600" },
  { id: "work", name: "Quản lý công việc", icon: Layers3, iconColor: "text-indigo-600" },
  { id: "system", name: "Tiện ích hệ thống", icon: Settings, iconColor: "text-slate-600" },
];

const BOOKMARK_STORAGE_KEY = "goal-app:bookmarked-modules";
const AVAILABLE_MODULE_IDS = new Set([
  "employee-statistics",
  "accounts",
  "departments",
  "projects",
  "jobs",
  "tasks",
  "deadlines",
]);

const MODULES: ApplicationModule[] = [
  { id: "employee-statistics", groupId: "employees", name: "Thống kê nhân sự", description: "Quản lý thống kê nhân sự", href: "/nhan-vien/thong-ke-nhan-su", icon: BarChart3, color: "text-emerald-600", background: "bg-emerald-50" },
  { id: "accounts", groupId: "employees", name: "Quản lý tài khoản", description: "Quản lý tài khoản nhân viên", href: "/nhan-vien", icon: UserRoundCog, color: "text-cyan-600", background: "bg-cyan-50" },
  { id: "departments", groupId: "employees", name: "Phòng Ban & Chức Vụ", description: "Quản lý phòng ban và chức vụ", href: "/nhan-vien/phong-ban-chuc-vu", icon: Building2, color: "text-orange-600", background: "bg-orange-50" },
  { id: "organization", groupId: "employees", name: "Sơ đồ tổ chức", description: "Quản lý sơ đồ tổ chức", href: "/nhan-vien/so-do-to-chuc", icon: Network, color: "text-emerald-600", background: "bg-emerald-50" },
  { id: "permissions", groupId: "employees", name: "Phân Quyền", description: "Quản lý phân quyền", href: "/nhan-vien/phan-quyen", icon: ShieldCheck, color: "text-rose-600", background: "bg-rose-50" },

  { id: "attendance", groupId: "attendance", name: "Chấm Công", description: "Quản lý chấm công", href: "/quan-ly-cong/cham-cong", icon: Timer, color: "text-teal-600", background: "bg-teal-50" },
  { id: "attendance-statistics", groupId: "attendance", name: "Thống Kê Công", description: "Quản lý thống kê công", href: "/quan-ly-cong/thong-ke-cong", icon: BarChart3, color: "text-blue-600", background: "bg-blue-50" },
  { id: "attendance-approval", groupId: "attendance", name: "Duyệt Công", description: "Quản lý duyệt công", href: "/quan-ly-cong/duyet-cong", icon: CheckSquare2, color: "text-green-600", background: "bg-green-50" },
  { id: "leave", groupId: "attendance", name: "Nghỉ Phép", description: "Quản lý nghỉ phép", href: "/quan-ly-cong/nghi-phep", icon: CalendarOff, color: "text-fuchsia-600", background: "bg-fuchsia-50" },
  { id: "employee-map", groupId: "attendance", name: "Bản Đồ NV", description: "Quản lý bản đồ nhân viên", href: "/quan-ly-cong/ban-do-nhan-vien", icon: Map, color: "text-sky-600", background: "bg-sky-50" },
  { id: "holidays", groupId: "attendance", name: "Cấu hình ngày lễ", description: "Quản lý cấu hình ngày lễ", href: "/quan-ly-cong/cau-hinh-ngay-le", icon: CalendarDays, color: "text-pink-600", background: "bg-pink-50" },

  { id: "projects", groupId: "work", name: "Danh sách dự án", description: "Quản lý danh sách dự án", href: "/quan-ly-cong-viec/danh-sach-du-an", icon: Layers3, color: "text-violet-600", background: "bg-violet-50" },
  { id: "jobs", groupId: "work", name: "Danh sách công việc", description: "Quản lý danh sách công việc", href: "/quan-ly-cong-viec/danh-sach-cong-viec", icon: ListChecks, color: "text-sky-600", background: "bg-sky-50" },
  { id: "tasks", groupId: "work", name: "Danh sách Task", description: "Quản lý danh sách task", href: "/quan-ly-cong-viec/danh-sach-task", icon: ListTodo, color: "text-emerald-600", background: "bg-emerald-50" },
  { id: "deadlines", groupId: "work", name: "Lịch hạn chót", description: "Theo dõi lịch hạn chót", href: "/quan-ly-cong-viec/lich-han-chot", icon: CalendarDays, color: "text-rose-600", background: "bg-rose-50" },
  { id: "gantt", groupId: "work", name: "Biểu đồ Gantt", description: "Theo dõi tiến độ bằng Gantt", href: "/quan-ly-cong-viec/bieu-do-gantt", icon: GanttChartSquare, color: "text-indigo-600", background: "bg-indigo-50" },

  { id: "assets", groupId: "system", name: "Quản lý tài sản", description: "Quản lý tài sản công ty", href: "/quan-ly-tai-san", icon: PackageSearch, color: "text-amber-600", background: "bg-amber-50" },
  { id: "documents", groupId: "system", name: "Tài liệu", description: "Quản lý tài liệu nội bộ", href: "/tai-lieu", icon: FileText, color: "text-blue-600", background: "bg-blue-50" },
  { id: "system-settings", groupId: "system", name: "Hệ thống", description: "Cấu hình hệ thống", href: "/he-thong", icon: Settings, color: "text-slate-600", background: "bg-slate-100" },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ApplicationHubPage() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<ModuleGroupId | "">("");
  const [tab, setTab] = useState<"functions" | "bookmarks">("functions");
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(BOOKMARK_STORAGE_KEY) ?? "[]") as unknown;
      if (!Array.isArray(saved)) return;
      const validIds = AVAILABLE_MODULE_IDS;
      // Chỉ khôi phục những module vẫn còn tồn tại trong cấu hình hiện tại.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBookmarks([...new Set(saved.filter((id): id is string => typeof id === "string" && validIds.has(id)))]);
    } catch {
      window.localStorage.removeItem(BOOKMARK_STORAGE_KEY);
    }
  }, []);

  function toggleBookmark(moduleId: string) {
    setBookmarks((current) => {
      const next = current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId];
      window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const visibleModules = useMemo(() => {
    const keyword = normalize(search.trim());
    return MODULES.filter((module) => {
      const matchesSearch = !keyword || normalize(`${module.name} ${module.description}`).includes(keyword);
      const matchesGroup = !group || module.groupId === group;
      const matchesTab = tab === "functions" || bookmarks.includes(module.id);
      return matchesSearch && matchesGroup && matchesTab;
    });
  }, [bookmarks, group, search, tab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="relative w-full max-w-[520px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm module theo tên hoặc mô tả..."
            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <label className="relative w-32 shrink-0">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <select
            aria-label="Lọc theo nhóm"
            value={group}
            onChange={(event) => setGroup(event.target.value as ModuleGroupId | "")}
            className="h-10 w-full appearance-none rounded-xl border border-gray-200 bg-white pl-9 pr-8 text-sm text-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Nhóm</option>
            {GROUPS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 sm:px-6 lg:px-8">
        {GROUPS.map((moduleGroup) => {
          const groupModules = visibleModules.filter((module) => module.groupId === moduleGroup.id);
          if (groupModules.length === 0) return null;
          const GroupIcon = moduleGroup.icon;

          return (
            <section key={moduleGroup.id} className="mb-8">
              <div className="mb-2 flex items-center justify-between border-b border-gray-100 py-2">
                <h2 className="flex items-center gap-2.5 text-sm font-bold uppercase text-slate-900">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm">
                    <GroupIcon className={cn("h-5 w-5", moduleGroup.iconColor)} />
                  </span>
                  {moduleGroup.name}
                </h2>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase text-gray-500">
                  {groupModules.length} chức năng
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupModules.map((module) => {
                  const ModuleIcon = module.icon;
                  const bookmarked = bookmarks.includes(module.id);
                  const available = AVAILABLE_MODULE_IDS.has(module.id);
                  const moduleContent = (
                    <>
                      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", module.background)}>
                        <ModuleIcon className={cn("h-6 w-6", module.color)} />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-base text-slate-800">{module.name}</b>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">{module.description}</span>
                      </span>
                    </>
                  );
                  return (
                    <div
                      key={module.id}
                      title={available ? undefined : "Trang này chưa được xây dựng"}
                      className={cn(
                        "group relative rounded-2xl border border-gray-200 bg-white transition",
                        available
                          ? "hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                          : "cursor-not-allowed hover:border-rose-200 hover:bg-rose-50/20"
                      )}
                    >
                      {available ? (
                        <Link href={module.href} className="flex min-h-[88px] items-center gap-4 rounded-2xl px-4 py-3 pr-20">
                          {moduleContent}
                          <ChevronRight className="absolute right-5 h-4 w-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                        </Link>
                      ) : (
                        <div aria-disabled="true" className="flex min-h-[88px] items-center gap-4 rounded-2xl px-4 py-3 pr-14">
                          {moduleContent}
                          <Ban className="absolute right-5 h-5 w-5 scale-75 text-rose-500 opacity-0 transition group-hover:scale-100 group-hover:opacity-100" />
                        </div>
                      )}
                      {available && (
                        <button
                          type="button"
                          title={bookmarked ? "Bỏ đánh dấu" : "Đánh dấu"}
                          aria-label={bookmarked ? `Bỏ đánh dấu ${module.name}` : `Đánh dấu ${module.name}`}
                          onClick={() => toggleBookmark(module.id)}
                          className={cn("absolute right-10 top-1/2 -translate-y-1/2 rounded-lg p-2 transition", bookmarked ? "text-amber-500" : "text-gray-300 opacity-0 hover:text-amber-500 group-hover:opacity-100")}
                        >
                          <Star className={cn("h-4 w-4", bookmarked && "fill-current")} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {visibleModules.length === 0 && (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <ClipboardList className="mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-600">{tab === "bookmarks" ? "Chưa có chức năng được đánh dấu" : "Không tìm thấy chức năng phù hợp"}</p>
            <p className="mt-1 text-xs text-gray-400">{tab === "bookmarks" ? "Nhấn biểu tượng ngôi sao trên một chức năng để lưu tại đây." : "Thử thay đổi từ khóa hoặc nhóm đang chọn."}</p>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center border-t border-gray-200 bg-white px-4 py-2">
        <div className="grid w-full max-w-sm grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button type="button" onClick={() => setTab("functions")} className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition", tab === "functions" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700")}>Chức năng</button>
          <button
            type="button"
            onClick={() => setTab("bookmarks")}
            aria-label={`Đánh dấu, ${bookmarks.length} chức năng`}
            className={cn("flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition", tab === "bookmarks" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700")}
          >
            Đánh dấu
            {bookmarks.length > 0 && (
              <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold", tab === "bookmarks" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-600")}>
                {bookmarks.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
