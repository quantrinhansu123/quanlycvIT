import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Home,
  Users,
  ChartNoAxesColumnIncreasing,
  UserRoundCog,
  Building2,
  Network,
  ShieldCheck,
  Settings2,
  Layers,
  ListChecks,
  ListTodo,
  Kanban,
  CalendarClock,
  GanttChartSquare,
  Archive,
  BookOpen,
  Cog,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Ứng dụng", href: "/ung-dung", icon: Home },
  {
    label: "Nhân viên",
    href: "/nhan-vien",
    icon: Users,
    children: [
      {
        label: "Thống kê nhân sự",
        href: "/nhan-vien#thong-ke-nhan-su",
        icon: ChartNoAxesColumnIncreasing,
      },
      {
        label: "Quản lý tài khoản",
        href: "/nhan-vien",
        icon: UserRoundCog,
      },
      {
        label: "Phòng Ban & Chức Vụ",
        href: "/nhan-vien#phong-ban-chuc-vu",
        icon: Building2,
      },
      {
        label: "Sơ đồ tổ chức",
        href: "/nhan-vien#so-do-to-chuc",
        icon: Network,
      },
      {
        label: "Phân Quyền",
        href: "/nhan-vien#phan-quyen",
        icon: ShieldCheck,
      },
    ],
  },
  { label: "Quản lý công", href: "/quan-ly-cong", icon: Settings2 },
  {
    label: "Quản lý công việc",
    href: "/quan-ly-cong-viec",
    icon: Layers,
    children: [
      {
        label: "Danh sách dự án",
        href: "/quan-ly-cong-viec/danh-sach-du-an",
        icon: Layers,
      },
      {
        label: "Danh sách công việc",
        href: "/quan-ly-cong-viec/danh-sach-cong-viec",
        icon: ListChecks,
      },
      {
        label: "Danh sách Task",
        href: "/quan-ly-cong-viec/danh-sach-task",
        icon: ListTodo,
      },
      {
        label: "Bảng Kanban",
        href: "/quan-ly-cong-viec/bang-kanban",
        icon: Kanban,
      },
      {
        label: "Lịch hạn chót",
        href: "/quan-ly-cong-viec/lich-han-chot",
        icon: CalendarClock,
      },
      {
        label: "Biểu đồ Gantt",
        href: "/quan-ly-cong-viec/bieu-do-gantt",
        icon: GanttChartSquare,
      },
    ],
  },
  { label: "Quản lý tài sản", href: "/quan-ly-tai-san", icon: Archive },
  { label: "Tài liệu", href: "/tai-lieu", icon: BookOpen },
  { label: "Hệ thống", href: "/he-thong", icon: Cog },
];

export const BREADCRUMB_LABELS: Record<string, string> = {
  "quan-ly-cong-viec": "Quản lý công việc",
  "danh-sach-du-an": "Danh sách dự án",
  "danh-sach-cong-viec": "Danh sách công việc",
  "danh-sach-task": "Danh sách Task",
  "bang-kanban": "Bảng Kanban",
  "lich-han-chot": "Lịch hạn chót",
  "bieu-do-gantt": "Biểu đồ Gantt",
  "ung-dung": "Ứng dụng",
  "nhan-vien": "Nhân viên",
  "quan-ly-cong": "Quản lý công",
  "quan-ly-tai-san": "Quản lý tài sản",
  "tai-lieu": "Tài liệu",
  "he-thong": "Hệ thống",
};
