import type { Project, ProjectMember } from "@/types/project";
import { DEFAULT_PROJECT_STEPS } from "@/types/project";

export const DIRECTORY: ProjectMember[] = [
  {
    id: "nv-001",
    name: "Nguyễn Văn Nam",
    role: "Nhân viên dự án",
    email: "nam.nv@company.com",
    avatarColor: "#F59E0B",
  },
  {
    id: "nv-002",
    name: "Lê Văn Hùng",
    role: "Kỹ thuật",
    email: "hung.lv@company.com",
    avatarColor: "#1F2937",
  },
  {
    id: "nv-003",
    name: "Trần Thị Hồng",
    role: "Nhân viên dự án",
    email: "hong.tt@company.com",
    avatarColor: "#DC2626",
  },
  {
    id: "nv-004",
    name: "Phạm Thị Lan",
    role: "Kế toán",
    email: "lan.pt@company.com",
    avatarColor: "#0EA5E9",
  },
  {
    id: "nv-005",
    name: "Đỗ Minh Quân",
    role: "Kỹ thuật",
    email: "quan.dm@company.com",
    avatarColor: "#16A34A",
  },
];

export interface ProjectTask {
  id: string;
  title: string;
  status: "todo" | "inProgress" | "review" | "done";
  assignee: ProjectMember;
  dueDate: string;
}

export const TASK_STATUS_LABEL: Record<ProjectTask["status"], string> = {
  todo: "Cần làm",
  inProgress: "Đang làm",
  review: "Chờ đánh giá",
  done: "Hoàn thành",
};

export const TASKS_BY_PROJECT: Record<string, ProjectTask[]> = {
  "1": [
    {
      id: "t-1",
      title: "Thiết kế giao diện màn hình Dashboard",
      status: "done",
      assignee: DIRECTORY[0],
      dueDate: "2025-04-15",
    },
  ],
  "2": [
    {
      id: "t-2",
      title: "Khảo sát hiện trạng hạ tầng mạng",
      status: "done",
      assignee: DIRECTORY[1],
      dueDate: "2026-01-25",
    },
    {
      id: "t-3",
      title: "Thiết kế bản vẽ sơ đồ đi dây",
      status: "done",
      assignee: DIRECTORY[4],
      dueDate: "2026-02-10",
    },
    {
      id: "t-4",
      title: "Thi công kéo cáp tầng 1 - 5",
      status: "inProgress",
      assignee: DIRECTORY[1],
      dueDate: "2026-04-30",
    },
    {
      id: "t-5",
      title: "Thi công kéo cáp tầng 6 - 10",
      status: "inProgress",
      assignee: DIRECTORY[4],
      dueDate: "2026-05-30",
    },
    {
      id: "t-6",
      title: "Lắp đặt thiết bị mạng trung tâm",
      status: "inProgress",
      assignee: DIRECTORY[3],
      dueDate: "2026-06-15",
    },
    {
      id: "t-7",
      title: "Nghiệm thu bàn giao hệ thống",
      status: "todo",
      assignee: DIRECTORY[1],
      dueDate: "2026-07-01",
    },
  ],
};

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "1",
    code: "DA-GOAL",
    name: "Dự án Phát triển App Goal",
    description:
      "Xây dựng ứng dụng quản trị tiến độ công việc và đánh giá KPI nội bộ.",
    color: "purple",
    steps: DEFAULT_PROJECT_STEPS,
    startDate: "2025-03-01",
    endDate: "2025-12-30",
    managers: [DIRECTORY[0]],
    manager: DIRECTORY[0],
    members: [DIRECTORY[0], DIRECTORY[1], DIRECTORY[2]],
    stats: { total: 1, done: 1, inProgress: 0, overdue: 0 },
  },
  {
    id: "2",
    code: "DA-NETA",
    name: "Dự án Thi công mạng Tòa nhà A",
    description:
      "Tư vấn, thiết kế bản vẽ và thi công kéo cáp mạng LAN, lắp đặt thiết bị mạng cho toàn bộ tòa nhà.",
    color: "green",
    steps: DEFAULT_PROJECT_STEPS,
    startDate: "2026-01-10",
    endDate: "2026-08-30",
    managers: [DIRECTORY[1]],
    manager: DIRECTORY[1],
    members: [DIRECTORY[1], DIRECTORY[3], DIRECTORY[4]],
    stats: { total: 6, done: 2, inProgress: 3, overdue: 1 },
  },
];
