import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/api";
import { requireRequestAccount } from "@/lib/supabase/authorization";
import {
  listDirectory,
  listProjectsPage,
  listWorkTasksPage,
} from "@/lib/supabase/data";
import type { Project, ProjectMember } from "@/types/project";
import type { WorkTask } from "@/types/task";

export const DASHBOARD_PROJECT_LIMIT = 100;
export const DASHBOARD_TASK_LIMIT = 200;

export interface DashboardData {
  projects: Project[];
  tasks: WorkTask[];
  members: ProjectMember[];
  totalProjects: number;
  totalTasks: number;
}

/** Tải dữ liệu dashboard từ cookie phiên hiện tại và giữ đúng phạm vi quyền. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient();
  const access = await requireRequestAccount(supabase);
  const participantAccountId = access.role === "member" ? access.id : undefined;

  const [projects, tasks, members] = await Promise.all([
    listProjectsPage(supabase, {
      participantAccountId,
      page: 1,
      pageSize: DASHBOARD_PROJECT_LIMIT,
    }),
    listWorkTasksPage(supabase, {
      ...(participantAccountId ? { assigneeIds: [participantAccountId] } : {}),
      page: 1,
      pageSize: DASHBOARD_TASK_LIMIT,
    }),
    listDirectory(supabase),
  ]);

  return {
    projects: projects.items,
    tasks: tasks.items,
    members,
    totalProjects: projects.total,
    totalTasks: tasks.total,
  };
}
