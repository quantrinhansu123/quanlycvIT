"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileClock,
  Flag,
  History,
  ImagePlus,
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Pencil,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Square,
  TestTube2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import { subtaskService } from "@/services/subtask-service";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import type { TaskFileAttachment, TaskLinkAttachment, WorkTaskDirectoryItem } from "@/types/task";
import { SUBTASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from "@/types/task";
import { detailTaskProgressPercent, emptyAcceptanceRow, INITIAL_HANDOVER_SOURCE_ID } from "@/lib/handover";
import type { AcceptanceRow, Subtask, SubtaskReport, SubtaskTestHistoryEntry, SubtaskTimeRecord } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import type { TaskActivityEvent } from "@/types/activity";
import { AvatarStack } from "@/components/ui/Avatar";
import { TaskActivityTimeline } from "@/components/timeline/TaskActivityTimeline";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { ProgressReportItem } from "@/components/tasks/ProgressReportItem";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { cn, formatDateVN } from "@/lib/utils";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { getErrorMessage } from "@/lib/errors";
import { InlineTaskAttachmentEditor } from "@/components/tasks/InlineTaskAttachmentEditor";
import { DetailAttachments } from "@/components/tasks/DetailAttachments";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { useSplitView } from "@/components/layout/SplitViewShell";
import type { SubtaskPromptImportRequest } from "@/components/subtasks/SubtaskPromptPanel";

const SubtaskPromptPanel = dynamic(
  () => import("@/components/subtasks/SubtaskPromptPanel").then((mod) => mod.SubtaskPromptPanel),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-2xl bg-gray-100" /> }
);
const SubtaskFormModal = dynamic(
  () => import("@/components/subtasks/SubtaskFormModal").then((mod) => mod.SubtaskFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);
const TaskReportDrawer = dynamic(
  () => import("@/components/tasks/TaskReportDrawer").then((mod) => mod.TaskReportDrawer),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type Tab = "info" | "reports";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDayDistance(date: string): number {
  const target = new Date(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS);
}

function getRecordedDuration(records: SubtaskTimeRecord[]): number {
  let startedAt: number | null = null;
  let total = 0;
  for (const record of records) {
    if (record.type === "start") {
      startedAt = Date.parse(record.at);
    } else if (startedAt !== null) {
      const endedAt = Date.parse(record.at);
      if (Number.isFinite(endedAt) && endedAt >= startedAt) total += endedAt - startedAt;
      startedAt = null;
    }
  }
  return total;
}

function formatRecordedDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} giờ ${remainingMinutes} phút` : `${minutes} phút`;
}

function formatTimeRecordDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(value));
}

type IterationDraft = {
  id: string | null;
  description: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
  acceptance: AcceptanceRow;
};

function emptyIterationDraft(): IterationDraft {
  return {
    id: null,
    description: "",
    files: [],
    links: [],
    images: [],
    acceptance: emptyAcceptanceRow(),
  };
}

function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

interface SubtaskDetailViewProps {
  subtaskId: string;
  initialSubtask: Subtask | null;
  initialWorkTasks: WorkTaskDirectoryItem[];
  initialReports: SubtaskReport[];
  initialMembers: ProjectMember[];
  initialActivity: TaskActivityEvent[];
  initialActivityTotal: number;
  initialTestHistory: SubtaskTestHistoryEntry[];
}

const ACTIVITY_PAGE_SIZE = 20;
const SUBTASK_ACCEPTED_EVENT = "app:subtask-accepted";

export function SubtaskDetailView({
  subtaskId,
  initialSubtask,
  initialWorkTasks,
  initialReports,
  initialMembers,
  initialActivity,
  initialActivityTotal,
  initialTestHistory,
}: SubtaskDetailViewProps) {
  const router = useRouter();
  const { notify } = useFeedback();
  const { account } = useCurrentAccount();
  const cache = useSessionDataCache();
  const splitView = useSplitView();
  const [subtask, setSubtask] = useState<Subtask | null>(initialSubtask);
  const [workTasks, setWorkTasks] = useState<WorkTaskDirectoryItem[]>(initialWorkTasks);
  const [reports, setReports] = useState<SubtaskReport[]>(initialReports);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [projects, setProjects] = useState<ProjectDirectoryItem[]>([]);
  const [activity, setActivity] = useState<TaskActivityEvent[]>(initialActivity);
  const [activityTotal, setActivityTotal] = useState(initialActivityTotal);
  const [testHistory, setTestHistory] = useState<SubtaskTestHistoryEntry[]>(initialTestHistory);
  const [timeRecords, setTimeRecords] = useState<SubtaskTimeRecord[]>([]);
  const [savingTimeRecord, setSavingTimeRecord] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [iterationEditor, setIterationEditor] = useState<IterationDraft | null>(null);
  const [savingIteration, setSavingIteration] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [directoryReady, setDirectoryReady] = useState(initialMembers.length > 0);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [reportAtCompletion, setReportAtCompletion] = useState(false);
  const [quickUpdating, setQuickUpdating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [promptImport, setPromptImport] = useState<SubtaskPromptImportRequest | null>(null);
  const [savingAcceptance, setSavingAcceptance] = useState(false);
  const [uploadingAcceptanceId, setUploadingAcceptanceId] = useState<string | null>(null);

  const recordTime = useCallback(async (type: SubtaskTimeRecord["type"]) => {
    if (savingTimeRecord) return;
    setSavingTimeRecord(true);
    try {
      setTimeRecords(await subtaskService.appendTimeRecord(subtaskId, type));
    } catch (recordError) {
      notify({
        type: "error",
        title: "Không thể ghi nhận thời gian",
        description: getErrorMessage(recordError, "Vui lòng thử lại."),
      });
    } finally {
      setSavingTimeRecord(false);
    }
  }, [notify, savingTimeRecord, subtaskId]);

  /**
   * Nhật ký hoạt động được ghi bằng trigger DB ngay khi mutation ghi xong nên chỉ cần
   * đọc lại trang đầu — không cần full reload 4 nguồn dữ liệu như `load()`.
   */
  const refreshActivity = useCallback(async () => {
    try {
      const activityPage = await subtaskService.getSubtaskActivity(subtaskId, 1, ACTIVITY_PAGE_SIZE);
      setActivity(activityPage.items);
      setActivityTotal(activityPage.total);
    } catch {
      // Bỏ qua lỗi làm mới timeline — không chặn luồng thao tác chính.
    }
  }, [subtaskId]);

  const load = useCallback(async () => {
    try {
      const subtaskData = await subtaskService.getSubtaskById(subtaskId);
      setSubtask(subtaskData);
      setError(false);
      void refreshActivity();
      if (tab === "reports") {
        const reportData = await subtaskService.getSubtaskReports(subtaskId);
        setReports(reportData);
      }
    } catch (loadError) {
      setError(true);
      notify({
        type: "error",
        title: "Không thể tải chi tiết Task",
        description: getErrorMessage(
          loadError,
          "Vui lòng kiểm tra kết nối và thử lại."
        ),
      });
    }
  }, [subtaskId, notify, tab, refreshActivity]);

  async function saveAcceptance(sourceId: string, patch: Partial<AcceptanceRow>) {
    if (!subtask || savingAcceptance) return;
    const current = subtask.handover?.rows?.[sourceId] ?? emptyAcceptanceRow();
    const rows = {
      ...(subtask.handover?.rows ?? {}),
      [sourceId]: { ...current, ...patch },
    };
    const statuses = Object.fromEntries(
      Object.entries(rows).map(([id, row]) => [id, row.status === "accepted" ? "handedOver" as const : "pending" as const]),
    );
    setSavingAcceptance(true);
    try {
      const handover = await subtaskService.updateHandover(subtask.id, {
        text: rows[INITIAL_HANDOVER_SOURCE_ID]?.note ?? "",
        imageUrl: rows[INITIAL_HANDOVER_SOURCE_ID]?.imageUrl ?? "",
        statuses,
        rows,
      });
      setSubtask((currentSubtask) => currentSubtask ? { ...currentSubtask, handover } : currentSubtask);
    } catch (saveError) {
      notify({
        type: "error",
        title: "Không thể lưu nghiệm thu",
        description: getErrorMessage(saveError, "Vui lòng thử lại."),
      });
    } finally {
      setSavingAcceptance(false);
    }
  }

  async function uploadAcceptanceImage(sourceId: string, file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      notify({ type: "error", title: "Hãy chọn một ảnh JPG, PNG, WEBP hoặc AVIF." });
      return;
    }
    setUploadingAcceptanceId(sourceId);
    try {
      const imageUrl = await subtaskService.uploadImage(file);
      await saveAcceptance(sourceId, { imageUrl });
    } catch (uploadError) {
      notify({
        type: "error",
        title: "Không thể tải ảnh nghiệm thu",
        description: getErrorMessage(uploadError, "Ảnh phải là JPG, PNG, WEBP hoặc AVIF và tối đa 10 MB."),
      });
    } finally {
      setUploadingAcceptanceId(null);
    }
  }

  async function uploadDraftAcceptanceImage(file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      notify({ type: "error", title: "Hãy chọn một ảnh JPG, PNG, WEBP hoặc AVIF." });
      return;
    }
    setUploadingAcceptanceId("draft");
    try {
      const imageUrl = await subtaskService.uploadImage(file);
      setIterationEditor((current) => current
        ? { ...current, acceptance: { ...current.acceptance, imageUrl } }
        : current);
    } catch (uploadError) {
      notify({
        type: "error",
        title: "Không thể tải ảnh nghiệm thu",
        description: getErrorMessage(uploadError, "Ảnh phải là JPG, PNG, WEBP hoặc AVIF và tối đa 10 MB."),
      });
    } finally {
      setUploadingAcceptanceId(null);
    }
  }

  /** Directory đầy đủ chỉ cần khi mở form sửa / báo cáo. */
  const ensureDirectory = useCallback(async () => {
    if (directoryReady && projects.length > 0) return;
    const [workTaskList, memberData, projectData] = await Promise.all([
      taskService.getTaskDirectory(),
      projectService.getDirectory(),
      projectService.getProjectDirectory(),
    ]);
    setWorkTasks(workTaskList);
    setMembers(memberData);
    setProjects(projectData);
    setDirectoryReady(true);
  }, [directoryReady, projects.length]);

  // Timeline: trì hoãn sau paint để không tranh băng thông với hydrate UI.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([
        subtaskService.getSubtaskActivity(subtaskId, 1, ACTIVITY_PAGE_SIZE),
        subtaskService.getSubtaskTestHistory(subtaskId),
        subtaskService.getTimeRecords(subtaskId),
      ])
        .then(([activityPage, historyData, timeRecordData]) => {
          if (!active) return;
          setActivity(activityPage.items);
          setActivityTotal(activityPage.total);
          setTestHistory(historyData);
          setTimeRecords(timeRecordData);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [subtaskId]);

  // Báo cáo chỉ tải khi mở tab lịch sử.
  useEffect(() => {
    if (tab !== "reports") return;
    let active = true;
    // Chỉ báo đang tải khi tab Báo cáo được mở; trạng thái này gắn với request bên ngoài.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecondaryLoading(true);
    void subtaskService.getSubtaskReports(subtaskId)
      .then((reportData) => {
        if (active) setReports(reportData);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSecondaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, subtaskId]);

  const handleAttachmentSave = useCallback(async (value: {
    files: TaskFileAttachment[];
    links: TaskLinkAttachment[];
    images: string[];
  }) => {
    if (!subtask) return;
    try {
      const updated = await subtaskService.updateSubtask(subtask.id, {
        title: subtask.title,
        description: subtask.description,
        workTaskId: subtask.workTaskId,
        assigneeIds: subtask.assignees.map((member) => member.id),
        testerId: subtask.tester?.id,
        priority: subtask.priority,
        startDate: subtask.startDate,
        dueDate: subtask.dueDate,
        progress: subtask.progress,
        tags: subtask.tags,
        files: value.files,
        links: value.links,
        images: value.images,
        updates: subtask.updates,
        issues: subtask.issues,
      });
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      setSubtask(updated);
      void refreshActivity();
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu Task",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [notify, refreshActivity, subtask]);

  const handleUpdateAttachmentSave = useCallback(async (
    updateId: string,
    value: {
      files: TaskFileAttachment[];
      links: TaskLinkAttachment[];
      images: string[];
    }
  ) => {
    if (!subtask) return;
    try {
      const updated = await subtaskService.updateSubtask(subtask.id, {
        title: subtask.title,
        description: subtask.description,
        workTaskId: subtask.workTaskId,
        assigneeIds: subtask.assignees.map((member) => member.id),
        testerId: subtask.tester?.id,
        priority: subtask.priority,
        startDate: subtask.startDate,
        dueDate: subtask.dueDate,
        progress: subtask.progress,
        tags: subtask.tags,
        files: subtask.files,
        links: subtask.links,
        images: subtask.images,
        updates: subtask.updates.map((entry) =>
          entry.id === updateId ? { ...entry, ...value } : entry
        ),
        issues: subtask.issues,
      });
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      setSubtask(updated);
      void refreshActivity();
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu Task",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [notify, refreshActivity, subtask]);

  const handleSaveIteration = useCallback(async () => {
    if (!subtask || !iterationEditor || savingIteration) return;
    const description = iterationEditor.description.trim();
    if (!description) {
      notify({ type: "error", title: "Hãy nhập mô tả cho lần bổ sung." });
      return;
    }

    setSavingIteration(true);
    try {
      const createdId = iterationEditor.id ?? crypto.randomUUID();
      const updates = iterationEditor.id
        ? subtask.updates.map((entry) => entry.id === iterationEditor.id
          ? { ...entry, description }
          : entry)
        : [
            ...subtask.updates,
            {
              id: createdId,
              createdAt: new Date().toISOString(),
              description,
              files: iterationEditor.files,
              links: iterationEditor.links,
              images: iterationEditor.images,
            },
          ];
      const updated = await subtaskService.updateUpdates(subtask.id, updates);
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      if (!iterationEditor.id) {
        const rows = {
          ...(updated.handover?.rows ?? {}),
          [createdId]: iterationEditor.acceptance,
        };
        const statuses = Object.fromEntries(
          Object.entries(rows).map(([id, row]) => [id, row.status === "accepted" ? "handedOver" as const : "pending" as const]),
        );
        try {
          const handover = await subtaskService.updateHandover(subtask.id, {
            text: rows[INITIAL_HANDOVER_SOURCE_ID]?.note ?? "",
            imageUrl: rows[INITIAL_HANDOVER_SOURCE_ID]?.imageUrl ?? "",
            statuses,
            rows,
          });
          setSubtask({ ...updated, handover: handover ?? updated.handover });
        } catch (handoverError) {
          setSubtask(updated);
          setIterationEditor(null);
          notify({
            type: "error",
            title: "Đã thêm lần, chưa lưu được trạng thái",
            description: getErrorMessage(handoverError, "Có thể chỉnh trạng thái ngay trên lần vừa thêm."),
          });
          return;
        }
      } else {
        setSubtask(updated);
      }
      setIterationEditor(null);
      notify({ type: "success", title: iterationEditor.id ? "Đã cập nhật lần bổ sung" : "Đã thêm lần bổ sung" });
    } catch (saveError) {
      notify({ type: "error", title: "Không thể lưu lần bổ sung", description: getErrorMessage(saveError, "Vui lòng thử lại.") });
    } finally {
      setSavingIteration(false);
    }
  }, [iterationEditor, notify, savingIteration, subtask]);

  async function handleLoadMoreActivity() {
    if (activityLoadingMore || activity.length >= activityTotal) return;
    setActivityLoadingMore(true);
    try {
      const nextPage = Math.floor(activity.length / ACTIVITY_PAGE_SIZE) + 1;
      const activityPage = await subtaskService.getSubtaskActivity(
        subtaskId,
        nextPage,
        ACTIVITY_PAGE_SIZE
      );
      setActivity((current) => [...current, ...activityPage.items]);
      setActivityTotal(activityPage.total);
    } catch (loadMoreError) {
      notify({
        type: "error",
        title: "Không thể tải thêm hoạt động",
        description: getErrorMessage(loadMoreError, "Vui lòng thử lại."),
      });
    } finally {
      setActivityLoadingMore(false);
    }
  }

  async function handleQuickUpdate(
    patch: Partial<Pick<Subtask, "priority" | "status">> & {
      assigneeIds?: string[];
    }
  ) {
    if (!subtask || quickUpdating) return;
    setQuickUpdating(true);
    try {
      const updated = await subtaskService.updateSubtask(subtask.id, {
        title: subtask.title,
        description: subtask.description,
        workTaskId: subtask.workTaskId,
        assigneeIds: subtask.assignees.map((member) => member.id),
        testerId: subtask.tester?.id,
        priority: subtask.priority,
        startDate: subtask.startDate,
        dueDate: subtask.dueDate,
        progress: subtask.progress,
        tags: subtask.tags,
        files: subtask.files,
        links: subtask.links,
        images: subtask.images,
        updates: subtask.updates,
        issues: subtask.issues,
        ...patch,
      });
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      setSubtask(updated);
      notify({ type: "success", title: "Đã cập nhật Task" });
      // Đổi ưu tiên/người thực hiện nhanh không đi qua load() — xóa cache list task
      // con + list công việc (tiến độ công việc cha tính từ trung bình các task con).
      cache.invalidate(CACHE_RESOURCE.subtasksList);
      cache.invalidate(CACHE_RESOURCE.tasksList);
      void refreshActivity();
    } catch (updateError) {
      notify({
        type: "error",
        title: "Cập nhật Task thất bại",
        description: getErrorMessage(
          updateError,
          "Không thể cập nhật nhanh Task."
        ),
      });
    } finally {
      setQuickUpdating(false);
    }
  }

  async function handleAccept() {
    if (!subtask || accepting) return;
    setAccepting(true);
    try {
      const accepted = await subtaskService.acceptSubtask(subtask.id);
      setSubtask(accepted);
      window.dispatchEvent(new CustomEvent("app:notifications-changed"));
      // Layout danh sách/chi tiết giữ danh sách mount khi mở Task. Patch ngay
      // bản ghi hiện tại thay vì xóa cache khiến danh sách chớp thành rỗng.
      window.dispatchEvent(new CustomEvent<Subtask>(SUBTASK_ACCEPTED_EVENT, { detail: accepted }));
      cache.invalidate(CACHE_RESOURCE.tasksList);
      void refreshActivity();
      notify({
        type: "success",
        title: "Đã xác nhận nhận Task",
        description: `Task “${subtask.title}” đã chuyển sang Đang làm.`,
      });
    } catch (acceptError) {
      notify({
        type: "error",
        title: "Không thể xác nhận Task",
        description: getErrorMessage(acceptError, "Vui lòng thử lại."),
      });
    } finally {
      setAccepting(false);
    }
  }

  async function handleTest(passed: boolean) {
    if (!subtask) return;
    const note = passed ? undefined : window.prompt("Mô tả lỗi cần người thực hiện sửa:")?.trim();
    if (!passed && !note) return;
    try {
      const updated = await subtaskService.submitTestResult(subtask.id, { passed, note });
      setSubtask(updated);
      const history = await subtaskService.getSubtaskTestHistory(subtask.id);
      setTestHistory(history);
      window.dispatchEvent(new CustomEvent("app:notifications-changed"));
      cache.invalidate(CACHE_RESOURCE.subtasksList);
      cache.invalidate(CACHE_RESOURCE.tasksList);
      void refreshActivity();
      notify({
        type: "success",
        title: passed ? "Task đã Pass kiểm thử" : "Đã trả Task về người thực hiện",
        description: passed ? "Task đã chuyển sang Chờ duyệt." : "Tiến độ Task đã được đặt về 99%.",
      });
    } catch (testError) {
      notify({
        type: "error",
        title: "Không thể ghi kết quả test",
        description: getErrorMessage(testError, "Vui lòng thử lại."),
      });
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 @sm/detail:px-6">
        <ErrorState onRetry={load} />
      </div>
    );
  }

  if (subtask === null) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-10 @sm/detail:px-6">
        <EmptyState
          icon={AlertCircle}
          title="Không tìm thấy Task"
          description="Task có thể đã bị xóa."
        />
      </div>
    );
  }

  const workTask = workTasks.find((item) => item.id === subtask.workTaskId);
  const assignee =
    subtask.assignees.find((member) => member.id === subtask.assigneeId) ??
    subtask.assignees[0] ??
    members.find((member) => member.id === subtask.assigneeId);
  const dueDistance = getDayDistance(subtask.dueDate);
  const overdue = isSubtaskOverdue(subtask);
  const needsAcceptance = Boolean(
    account?.role === "member" &&
    account.id !== subtask.testerId &&
    !subtask.acceptedAssigneeIds.includes(account.id)
  );
  const isTester = Boolean(account && account.id === subtask.testerId);
  const canEditHandover = Boolean(
    account && (
      account.role === "admin" ||
      account.role === "manager" ||
      subtask.assignees.some((member) => member.id === account.id)
    )
  );
  const canTest = subtask.status === "testing" && (isTester || account?.role === "admin");
  const statusLocked = subtask.status === "done";
  const canUpdateStatus = account?.role === "admin" || (account?.role === "member" && !isTester);
  const statusOptions = account?.role === "member" && !statusLocked
    ? SUBTASK_STATUS_OPTIONS.filter((option) => option.value !== "done")
    : SUBTASK_STATUS_OPTIONS;
  const lastTimeRecord = timeRecords.at(-1);
  const recordedDuration = getRecordedDuration(timeRecords);
  const actualProgress = detailTaskProgressPercent(
    subtask.updates.map((entry) => entry.id),
    subtask.handover?.rows,
  );

  return (
    <div className="min-h-full min-w-0 max-w-full overflow-x-clip bg-white pb-2 [contain:inline-size]">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex w-full min-w-0 max-w-full flex-wrap items-start justify-between gap-3 px-3 py-3 @sm/detail:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {splitView && !splitView.maximized ? (
              <>
                <button
                  type="button"
                  onClick={splitView.toggleDetailCollapsed}
                  className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:flex"
                  aria-label="Thu panel chi tiết"
                  title="Thu panel chi tiết"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:hidden"
                  aria-label="Quay lại"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                aria-label="Quay lại"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs leading-4 text-gray-400 @xl/detail:text-sm @xl/detail:leading-5">
              <Link
                href="/quan-ly-cong-viec/danh-sach-task"
                className="shrink-0 font-semibold text-gray-600 hover:text-brand-600"
              >
                Quản lý công việc
              </Link>
              {workTask && (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">&gt;</span>
                  <Link
                    href={`/quan-ly-cong-viec/danh-sach-cong-viec/${workTask.id}`}
                    className="min-w-0 break-words font-semibold text-gray-500 hover:text-brand-600"
                  >
                    Công việc {workTask.title}
                  </Link>
                </span>
              )}
              <span className="flex min-w-0 items-start gap-2">
                <span className="shrink-0">&gt;</span>
                <span className="min-w-0 break-words font-semibold text-gray-500">
                  {subtask.title}
                </span>
              </span>
            </nav>
          </div>

          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {statusLocked && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                <CircleCheck className="h-4 w-4" />
                Đã hoàn thành
              </span>
            )}
            {splitView && (
              <button
                type="button"
                onClick={splitView.toggleMaximized}
                className="hidden h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 xl:flex"
                aria-label={splitView.maximized ? "Thu nhỏ về chia đôi màn hình" : "Phóng to toàn màn hình"}
                title={splitView.maximized ? "Thu nhỏ về chia đôi màn hình" : "Phóng to toàn màn hình"}
              >
                {splitView.maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <Button
              onClick={() => {
                void ensureDirectory().then(() => setCreating(true));
              }}
              variant="secondary"
              className="rounded-full"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden @xl/detail:inline">Thêm task</span>
            </Button>
            {canTest ? (
              <>
                <Button onClick={() => void handleTest(false)} variant="secondary" className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                  Fail
                </Button>
                <Button onClick={() => void handleTest(true)} className="rounded-full bg-emerald-600 hover:bg-emerald-700">
                  <CircleCheck className="h-4 w-4" /> Pass
                </Button>
              </>
            ) : needsAcceptance ? (
              <Button
                onClick={() => void handleAccept()}
                disabled={accepting}
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                <CircleCheck className="h-4 w-4" />
                <span className="hidden @xl/detail:inline">{accepting ? "Đang xác nhận..." : "Xác nhận nhận Task"}</span>
              </Button>
            ) : !isTester && !statusLocked ? (
              <Button
                onClick={() => {
                  void ensureDirectory().then(() => setEditing(true));
                }}
                className="rounded-full bg-brand-600 hover:bg-brand-700"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden @xl/detail:inline">Chỉnh sửa Task</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-none px-3 pb-8 pt-4 @sm/detail:px-5">
        {tab === "info" ? (
          <div className="space-y-3">
            <section className="grid grid-cols-2 gap-2 @3xl/detail:grid-cols-4">
              <OverviewCard
                label="Tiến độ thực tế"
                icon={CircleCheck}
                iconClassName="bg-violet-50 text-violet-600"
              >
                <strong className="text-lg font-bold text-gray-950">
                  {actualProgress}%
                </strong>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{ width: `${actualProgress}%` }}
                  />
                </div>
              </OverviewCard>

              <OverviewCard
                label="Hạn hoàn thành"
                icon={Clock3}
                iconClassName="bg-rose-50 text-rose-600"
              >
                <p
                  className={cn(
                    "text-sm font-bold leading-snug",
                    overdue ? "text-rose-500" : "text-gray-900"
                  )}
                >
                  {overdue
                    ? `Trễ hạn ${Math.abs(dueDistance)} ngày`
                    : dueDistance === 0
                      ? "Hạn hôm nay"
                      : `Còn ${dueDistance} ngày`}
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {formatDateVN(subtask.dueDate)}
                </p>
              </OverviewCard>

              <OverviewCard
                label="Mức độ ưu tiên"
                icon={Flag}
                iconClassName="bg-orange-50 text-orange-500"
              >
                <QuickSelect
                  value={subtask.priority}
                  disabled={quickUpdating || statusLocked}
                  options={TASK_PRIORITY_OPTIONS}
                  onChange={(value) =>
                    handleQuickUpdate({
                      priority: value as Subtask["priority"],
                    })
                  }
                />
              </OverviewCard>

              <OverviewCard
                label="Trạng thái"
                icon={CircleAlert}
                iconClassName="bg-teal-50 text-teal-600"
              >
                <QuickSelect
                  value={subtask.status}
                  disabled={quickUpdating || statusLocked || !canUpdateStatus}
                  options={statusOptions}
                  onChange={(value) => {
                    if (value === "testing" && subtask.status !== "testing" && account?.role === "member") {
                      setReportAtCompletion(true);
                      void ensureDirectory().then(() => setReportDrawerOpen(true));
                      return;
                    }
                    handleQuickUpdate({ status: value as Subtask["status"] });
                  }}
                />
              </OverviewCard>
            </section>

            <SubtaskPromptPanel
              key={`${subtask.id}-${subtask.updatedAt ?? ""}`}
              subtaskId={subtask.id}
              initialItems={subtask.promptItems}
              initialDataLoaded
              importRequest={promptImport}
              onImported={(requestId) => {
                setPromptImport((current) => current?.requestId === requestId ? null : current);
              }}
            />


            {subtask.issues.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-base font-bold text-gray-900">Vấn đề &amp; giải pháp</h2>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="w-10 px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">Vấn đề</th>
                        <th className="px-3 py-2.5">Giải pháp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {subtask.issues.map((entry, index) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-3 align-top text-xs text-gray-400">{index + 1}</td>
                          <td className="px-3 py-3 align-top whitespace-pre-wrap text-gray-700">
                            {entry.problem || "—"}
                          </td>
                          <td className="px-3 py-3 align-top whitespace-pre-wrap text-gray-700">
                            {entry.solution || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <Panel
                accentClassName="bg-violet-600"
                icon={Info}
                iconClassName="text-violet-600"
                title="Chi tiết Task"
                subtitle="Mô tả Task và thời hạn thực hiện chi tiết"
                headerAction={!statusLocked && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIterationEditor(emptyIterationDraft())}
                    disabled={savingIteration || Boolean(iterationEditor)}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm lần
                  </Button>
                )}
              >
                <div className="space-y-2.5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-700">Lần 1</span>
                      <div className="flex items-center gap-2.5">
                        {subtask.createdAt && (
                          <span className="text-xs text-gray-400">{formatDateVN(subtask.createdAt)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPromptImport({
                            requestId: crypto.randomUUID(),
                            content: subtask.description ?? "",
                            imageUrls: subtask.images,
                          })}
                          disabled={!subtask.description?.trim() && subtask.images.length === 0}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Đưa vào Prompt
                        </button>
                      </div>
                    </div>
                    <AcceptanceFields
                      row={subtask.handover?.rows?.[INITIAL_HANDOVER_SOURCE_ID] ?? emptyAcceptanceRow()}
                      disabled={!canEditHandover || savingAcceptance}
                      uploading={uploadingAcceptanceId === INITIAL_HANDOVER_SOURCE_ID}
                      onSave={(patch) => void saveAcceptance(INITIAL_HANDOVER_SOURCE_ID, patch)}
                      onUpload={(file) => void uploadAcceptanceImage(INITIAL_HANDOVER_SOURCE_ID, file)}
                    />
                    <div className="max-w-full overflow-x-auto text-sm leading-6 text-gray-700">
                      <DetailDescription
                        description={subtask.description}
                        emptyText="Chưa có mô tả cho Task này."
                      />
                    </div>
                    {statusLocked ? (
                      <DetailAttachments
                        entityLabel="Task"
                        files={subtask.files}
                        links={subtask.links}
                        images={subtask.images}
                      />
                    ) : (
                      <InlineTaskAttachmentEditor
                        key={subtask.id}
                        entityLabel="Task"
                        files={subtask.files}
                        links={subtask.links}
                        images={subtask.images}
                        onUploadFile={subtaskService.uploadFile}
                        onUploadImage={subtaskService.uploadImage}
                        onSave={handleAttachmentSave}
                      />
                    )}
                  </div>
                  {subtask.updates.length > 0 && (
                    <div className="space-y-2.5">
                      {subtask.updates.map((entry, index) => (
                        <div key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-700">Lần {index + 2}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">{formatDateVN(entry.createdAt)}</span>
                              {!statusLocked && (
                                <button
                                  type="button"
                                  onClick={() => setIterationEditor({
                                    id: entry.id,
                                    description: entry.description ?? "",
                                    files: entry.files,
                                    links: entry.links,
                                    images: entry.images,
                                    acceptance: subtask.handover?.rows?.[entry.id] ?? emptyAcceptanceRow(),
                                  })}
                                  disabled={savingIteration || Boolean(iterationEditor)}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Sửa
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setPromptImport({
                                  requestId: crypto.randomUUID(),
                                  content: entry.description ?? "",
                                  imageUrls: entry.images,
                                })}
                                disabled={!entry.description?.trim() && entry.images.length === 0}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Đưa vào Prompt
                              </button>
                            </div>
                          </div>
                          <AcceptanceFields
                            row={subtask.handover?.rows?.[entry.id] ?? emptyAcceptanceRow()}
                            disabled={!canEditHandover || savingAcceptance}
                            uploading={uploadingAcceptanceId === entry.id}
                            onSave={(patch) => void saveAcceptance(entry.id, patch)}
                            onUpload={(file) => void uploadAcceptanceImage(entry.id, file)}
                          />
                          {iterationEditor?.id === entry.id ? (
                            <div>
                              <textarea
                                autoFocus
                                maxLength={5000}
                                rows={3}
                                value={iterationEditor.description}
                                onChange={(event) => setIterationEditor((current) => current ? { ...current, description: event.target.value } : current)}
                                placeholder="Nhập nội dung lần bổ sung..."
                                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <Button type="button" variant="ghost" size="sm" disabled={savingIteration} onClick={() => setIterationEditor(null)}>Hủy</Button>
                                <Button type="button" size="sm" disabled={savingIteration} onClick={() => void handleSaveIteration()}>{savingIteration ? "Đang lưu..." : "Lưu"}</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="max-w-full overflow-x-auto text-sm leading-6 text-gray-700">
                              <DetailDescription description={entry.description} emptyText="Lần này chưa có mô tả." />
                            </div>
                          )}
                          {statusLocked ? (
                            <DetailAttachments
                              entityLabel="Task"
                              files={entry.files}
                              links={entry.links}
                              images={entry.images}
                            />
                          ) : (
                            <InlineTaskAttachmentEditor
                              key={entry.id}
                              entityLabel="Task"
                              files={entry.files}
                              links={entry.links}
                              images={entry.images}
                              onUploadFile={subtaskService.uploadFile}
                              onUploadImage={subtaskService.uploadImage}
                              onSave={(value) => handleUpdateAttachmentSave(entry.id, value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {iterationEditor?.id === null && (
                    <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3 sm:p-4">
                      <div className="mb-2 text-sm font-semibold text-violet-800">Lần {subtask.updates.length + 2}</div>
                      <AcceptanceFields
                        row={iterationEditor.acceptance}
                        disabled={savingIteration || !canEditHandover}
                        uploading={uploadingAcceptanceId === "draft"}
                        onSave={(patch) => setIterationEditor((current) => current
                          ? { ...current, acceptance: { ...current.acceptance, ...patch } }
                          : current)}
                        onUpload={(file) => void uploadDraftAcceptanceImage(file)}
                      />
                      <textarea
                        autoFocus
                        maxLength={5000}
                        rows={3}
                        value={iterationEditor.description}
                        onChange={(event) => setIterationEditor((current) => current ? { ...current, description: event.target.value } : current)}
                        placeholder="Nhập nội dung lần bổ sung..."
                        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      />
                      <InlineTaskAttachmentEditor
                        entityLabel="Task"
                        files={iterationEditor.files}
                        links={iterationEditor.links}
                        images={iterationEditor.images}
                        onUploadFile={subtaskService.uploadFile}
                        onUploadImage={subtaskService.uploadImage}
                        onSave={async (value) => {
                          setIterationEditor((current) => current
                            ? { ...current, files: value.files, links: value.links, images: value.images }
                            : current);
                        }}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={savingIteration} onClick={() => setIterationEditor(null)}>Hủy</Button>
                        <Button type="button" size="sm" disabled={savingIteration || uploadingAcceptanceId === "draft"} onClick={() => void handleSaveIteration()}>{savingIteration ? "Đang lưu..." : "Lưu lần"}</Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-5 border-t border-gray-100 pt-4 @md/detail:grid-cols-2">
                  <DateInfo
                    label="Thời gian bắt đầu:"
                    value={formatDateVN(subtask.startDate)}
                    icon={CalendarDays}
                  />
                  <DateInfo
                    label="Hạn hoàn thành:"
                    value={formatDateVN(subtask.dueDate)}
                    icon={Clock3}
                  />
                </div>
              </Panel>

            </section>

            <section className="grid grid-cols-1 gap-5 @3xl/detail:grid-cols-3">
              <Panel
                className="@3xl/detail:col-span-2"
                accentClassName="bg-emerald-500"
                icon={RotateCcw}
                iconClassName="text-emerald-500"
                title="Timeline hoạt động Task"
                subtitle="Nhật ký lịch trình xử lý & báo cáo"
              >
                <TaskActivityTimeline
                  taskId={subtaskId}
                  currentAccountId={account?.id}
                  canEditAnyNote={account?.role === "admin"}
                  events={activity}
                  members={members}
                  hasMore={activity.length < activityTotal}
                  loadingMore={activityLoadingMore}
                  onLoadMore={handleLoadMoreActivity}
                  onActivityChanged={refreshActivity}
                />
              </Panel>

              <Panel
                accentClassName="bg-violet-600"
                icon={UsersRound}
                iconClassName="text-violet-600"
                title="Nhân sự"
                subtitle="Người thực hiện và người test"
              >
                <p className="mb-2 text-xs font-medium text-gray-400">
                  Người thực hiện:
                </p>
                <MemberMultiSelect
                  options={workTask?.assignees ?? []}
                  value={subtask.assignees.map((member) => member.id)}
                  onChange={(ids) => {
                    if (ids.length > 0) handleQuickUpdate({ assigneeIds: ids });
                  }}
                  emptyHint="Công việc chưa có người phụ trách"
                  disabled={quickUpdating || statusLocked}
                />

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-400">Ghi nhận thời gian:</p>
                      <p className="text-sm font-semibold text-gray-800">
                        Tổng thời gian: {formatRecordedDuration(recordedDuration)}
                      </p>
                    </div>
                    {lastTimeRecord?.type === "start" && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        Đang thực hiện
                      </span>
                    )}
                    {lastTimeRecord?.type === "pause" && (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                        Đang tạm dừng
                      </span>
                    )}
                  </div>
                  {!statusLocked && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lastTimeRecord?.type !== "start" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingTimeRecord}
                          onClick={() => void recordTime("start")}
                        >
                          <Play className="h-3.5 w-3.5" />
                          {lastTimeRecord?.type === "pause"
                            ? "Tiếp tục"
                            : lastTimeRecord?.type === "end"
                              ? "Bắt đầu phiên mới"
                              : "Bắt đầu"}
                        </Button>
                      )}
                      {lastTimeRecord?.type === "start" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={savingTimeRecord}
                            onClick={() => void recordTime("pause")}
                          >
                            <Pause className="h-3.5 w-3.5" />
                            Tạm dừng
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            disabled={savingTimeRecord}
                            onClick={() => void recordTime("end")}
                          >
                            <Square className="h-3.5 w-3.5" />
                            Kết thúc
                          </Button>
                        </>
                      )}
                      {lastTimeRecord?.type === "pause" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={savingTimeRecord}
                          onClick={() => void recordTime("end")}
                        >
                          <Square className="h-3.5 w-3.5" />
                          Kết thúc
                        </Button>
                      )}
                    </div>
                  )}
                  {timeRecords.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {[...timeRecords].reverse().slice(0, 5).map((record) => (
                        <li key={record.id} className="flex justify-between gap-2 text-[11px] text-gray-500">
                          <span>{record.type === "start" ? "Bắt đầu" : record.type === "pause" ? "Tạm dừng" : "Kết thúc"}</span>
                          <time dateTime={record.at}>{formatTimeRecordDate(record.at)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                  {timeRecords.length === 0 && (
                    <p className="mt-2 text-[11px] text-gray-400">Chưa có mốc thời gian.</p>
                  )}
                </div>

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-gray-400">
                    Người test:
                  </p>
                  {subtask.tester ? (
                    <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        <TestTube2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-gray-900">
                          {subtask.tester.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {subtask.tester.role ?? "Tester được phân công"}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400">
                      Chưa phân công người test.
                    </p>
                  )}
                </div>

                {subtask.assignees.length > 1 && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                    <AvatarStack people={subtask.assignees} max={4} />
                    {subtask.assignees.length} người thực hiện
                  </div>
                )}

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="mb-3 text-xs font-medium text-gray-400">
                    Lịch sử kiểm thử:
                  </p>
                  {testHistory.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400">
                      Chưa có kết quả kiểm thử.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {testHistory.map((entry) => {
                        const passed = entry.result === "passed";
                        return (
                          <li
                            key={entry.id}
                            className={cn(
                              "rounded-xl border px-3 py-3",
                              passed
                                ? "border-emerald-100 bg-emerald-50/60"
                                : "border-rose-100 bg-rose-50/60"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className={cn("text-sm font-bold", passed ? "text-emerald-700" : "text-rose-700")}>
                                {passed ? "Pass kiểm thử" : "Fail kiểm thử"}
                              </span>
                              <span className="shrink-0 text-[11px] text-gray-400">
                                {formatDateVN(entry.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              Tester: {entry.tester?.name ?? "Không xác định"}
                            </p>
                            {entry.note && (
                              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-700">
                                {entry.note}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Panel>
            </section>
          </div>
        ) : (
          <section className="min-h-[520px] rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <History className="h-4 w-4 text-violet-600" />
                  Lịch sử báo cáo Task
                </h2>
                <p className="mt-1 text-xs text-gray-400">
                  Các báo cáo tiến độ đã gửi cho Task
                </p>
              </div>
              {account?.role !== "admin" && !isTester && (subtask.status === "todo" || subtask.status === "inProgress") && <Button onClick={() => {
                setReportAtCompletion(false);
                void ensureDirectory().then(() => setReportDrawerOpen(true));
              }}>
                <Plus className="h-4 w-4" />
                Báo cáo tiến độ
              </Button>}
            </div>
            {secondaryLoading && reports.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <EmptyState
                icon={FileClock}
                title="Chưa có báo cáo nào"
                description="Báo cáo tiến độ Task sẽ được liệt kê tại đây."
              />
            ) : (
              <ul className="space-y-3">
                {reports.map((report) => (
                  <ProgressReportItem key={report.id} report={report} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="sticky bottom-0 z-20 max-w-full border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex w-full min-w-0 max-w-full gap-2">
          <BottomTab
            active={tab === "info"}
            onClick={() => setTab("info")}
            icon={Info}
            label="Thông tin Task"
          />
          <BottomTab
            active={tab === "reports"}
            onClick={() => setTab("reports")}
            icon={History}
            label="Lịch sử báo cáo"
            count={reports.length}
          />
        </div>
      </div>

      {editing && !statusLocked && (
        <SubtaskFormModal
          mode="edit"
          subtask={subtask}
          projects={projects}
          workTasks={workTasks}
          members={members}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setSubtask(saved);
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            cache.invalidate(CACHE_RESOURCE.tasksList);
          }}
        />
      )}

      {creating && (
        <SubtaskFormModal
          mode="create"
          defaultWorkTaskId={subtask.workTaskId}
          projects={projects}
          workTasks={workTasks}
          members={members}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            cache.invalidate(CACHE_RESOURCE.tasksList);
          }}
        />
      )}

      {reportDrawerOpen && account?.role !== "admin" && (
        <TaskReportDrawer
          task={{
            id: subtask.id,
            title: subtask.title,
            progress: subtask.progress,
            assigneeId: subtask.assigneeId,
          }}
          initialProgress={reportAtCompletion ? 100 : undefined}
          assignee={assignee}
          tester={subtask.tester}
          testerOptions={members}
          entityLabel="task"
          submitReport={(input) =>
            subtaskService.addSubtaskReport(subtask.id, input)
          }
          onClose={() => {
            setReportDrawerOpen(false);
            setReportAtCompletion(false);
          }}
          onSubmitted={() => {
            setTab("reports");
            load();
            cache.invalidate(CACHE_RESOURCE.subtasksList);
            cache.invalidate(CACHE_RESOURCE.tasksList);
          }}
        />
      )}

    </div>
  );
}

function AcceptanceFields({
  row,
  disabled,
  uploading,
  onSave,
  onUpload,
}: {
  row: AcceptanceRow;
  disabled: boolean;
  uploading: boolean;
  onSave: (patch: Partial<AcceptanceRow>) => void;
  onUpload: (file: File) => void;
}) {
  const [note, setNote] = useState(row.note);
  useEffect(() => {
    setNote(row.note);
  }, [row.note]);

  return (
    <div className="mb-3 flex items-end gap-3 overflow-x-auto border-b border-gray-200 pb-3">
      <div className="shrink-0">
        <p className="mb-1.5 text-xs font-semibold text-gray-500">Ảnh nghiệm thu</p>
        <div className="flex h-9 items-center gap-2">
          {isSafeImageUrl(row.imageUrl) && (
            <a href={row.imageUrl} target="_blank" rel="noreferrer" className="block h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-gray-200">
              <img src={row.imageUrl} alt="Ảnh nghiệm thu" className="h-full w-full object-cover" />
            </a>
          )}
          <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 ${disabled || uploading ? "pointer-events-none opacity-50" : "hover:bg-gray-50"}`}>
            {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {uploading ? "Đang tải..." : "Tải ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      <label className="w-40 shrink-0 text-xs font-semibold text-gray-500">
        Trạng thái
        <select
          value={row.status}
          disabled={disabled}
          onChange={(event) => onSave({ status: event.target.value as AcceptanceRow["status"] })}
          className="mt-1.5 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
        >
          <option value="pending">Chưa hoàn thành</option>
          <option value="accepted">Hoàn thành</option>
        </select>
      </label>
      <label className="min-w-48 flex-1 text-xs font-semibold text-gray-500">
        Note
        <input
          type="text"
          value={note}
          disabled={disabled}
          maxLength={5000}
          placeholder="Ghi chú nghiệm thu..."
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note !== row.note) onSave({ note });
          }}
          className="mt-1.5 h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-normal text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-50"
        />
      </label>
    </div>
  );
}

function DetailDescription({
  description,
  emptyText,
}: {
  description?: string;
  emptyText: string;
}) {
  if (!description) {
    return <p>{emptyText}</p>;
  }

  return (
    <p className="min-w-full whitespace-pre-wrap break-words">
      {description.split(/(https?:\/\/\S+)/g).map((part, index) =>
        /^https?:\/\/\S+$/.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-brand-600 underline-offset-2 hover:underline"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  );
}

function OverviewCard({
  label,
  icon: Icon,
  iconClassName,
  children,
}: {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
        {label}
      </p>
      <div className="mt-1 pr-8">{children}</div>
      <span
        className={cn(
          "absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full",
          iconClassName
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
    </article>
  );
}

function QuickSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 max-w-full rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  accentClassName,
  className,
  headerAction,
  children,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconClassName: string;
  accentClassName: string;
  className?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm",
        className
      )}
    >
      <div className={cn("h-1", accentClassName)} />
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
              {title}
            </h2>
          </div>
          {headerAction}
        </div>
        <p className={cn("text-xs text-gray-500", headerAction ? "mb-4 mt-1.5" : "mb-7 mt-2")}>{subtitle}</p>
        {children}
      </div>
    </article>
  );
}

function DateInfo({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-bold text-gray-900">
        <Icon className="h-4 w-4 text-violet-600" />
        {value}
      </p>
    </div>
  );
}

function BottomTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-5",
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
