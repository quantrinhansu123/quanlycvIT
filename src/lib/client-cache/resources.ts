/**
 * Tên "resource" dùng làm tiền tố cache key (xem buildCacheKey trong session-data-cache.ts).
 * Dùng chung giữa các trang để dữ liệu directory (thành viên/dự án/công việc dùng cho
 * dropdown, filter, phụ thuộc) chỉ tải một lần rồi tái sử dụng khi chuyển qua lại giữa
 * 3 trang danh sách, thay vì mỗi trang tự gọi lại API giống hệt nhau.
 */
export const CACHE_RESOURCE = {
  dashboard: "dashboard",
  projectsList: "projects-list",
  tasksList: "tasks-list",
  subtasksList: "subtasks-list",
  directoryMembers: "directory-members",
  directoryProjects: "directory-projects",
  directoryTasks: "directory-tasks",
} as const;
