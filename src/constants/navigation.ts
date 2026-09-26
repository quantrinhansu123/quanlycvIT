import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Home,
  Users,
  ChartNoAxesColumnIncreasing,
  UserRoundCog,
  Building2,
  Layers,
  ListChecks,
  ListTodo,
  WalletCards,
  CalendarCheck,
  CalendarDays,
  Settings2,
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
        href: "/nhan-vien/thong-ke-nhan-su",
        icon: ChartNoAxesColumnIncreasing,
      },
      {
        label: "Quản lý tài khoản",
        href: "/nhan-vien",
        icon: UserRoundCog,
      },
      {
        label: "Phòng Ban & Chức Vụ",
        href: "/nhan-vien/phong-ban-chuc-vu",
        icon: Building2,
      },
    ],
  },
  { label: "Lịch làm việc", href: "/nhan-vien/lich-lam-viec", icon: CalendarDays },
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
    ],
  },
  { label: "Quản lý thu chi", href: "/quan-ly-thu-chi", icon: WalletCards },
  {
    label: "Trực nhật",
    href: "/truc-nhat",
    icon: CalendarCheck,
    children: [
      {
        label: "Lịch trực",
        href: "/truc-nhat/lich-truc",
        icon: CalendarDays,
      },
      {
        label: "Cấu hình trực nhật",
        href: "/truc-nhat/cau-hinh",
        icon: Settings2,
      },
    ],
  },
];

export const BREADCRUMB_LABELS: Record<string, string> = {
  "quan-ly-cong-viec": "Quản lý công việc",
  "danh-sach-du-an": "Danh sách dự án",
  "danh-sach-cong-viec": "Danh sách công việc",
  "danh-sach-task": "Danh sách Task",
  "ung-dung": "Ứng dụng",
  "nhan-vien": "Nhân viên",
  "phong-ban-chuc-vu": "Phòng Ban & Chức Vụ",
  "thong-ke-nhan-su": "Thống kê nhân sự",
  "lich-lam-viec": "Lịch làm việc",
  "quan-ly-thu-chi": "Quản lý thu chi",
  "truc-nhat": "Trực nhật",
  "lich-truc": "Lịch trực",
  "cau-hinh": "Cấu hình trực nhật",
};
