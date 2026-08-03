import type { CacheTtl } from "@/lib/client-cache/session-data-cache";

/** TTL theo bảng mục 4 của PERF-UNIFIED-IMPLEMENTATION-PLAN.md (điều chỉnh khi có số đo thật). */
export const CACHE_TTL = {
  /** Tổng hợp dashboard; mutation liên quan sẽ tự invalidate qua dependency map. */
  dashboard: { freshMs: 15_000, staleMs: 120_000 } satisfies CacheTtl,
  /** Danh sách dự án/công việc/task. */
  list: { freshMs: 15_000, staleMs: 120_000 } satisfies CacheTtl,
  /** Danh bạ nhân sự / dự án dùng chung cho dropdown, filter, phụ thuộc. */
  directory: { freshMs: 5 * 60_000, staleMs: 15 * 60_000 } satisfies CacheTtl,
} as const;
