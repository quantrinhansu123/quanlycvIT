"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Printer,
  Send,
  TestTube2,
  Trash2,
  UsersRound,
  X,
  type LucideIcon,
  Image as ImageIcon,
} from "lucide-react";
import { AcceptanceFields } from "@/components/subtasks/AcceptanceFields";
import { TaskDetailDrawer } from "@/components/subtasks/TaskDetailDrawer";
import { formatSessionDuration, taskTimeSessions } from "@/lib/task-time-sessions";
import { AcceptanceImageInput } from "@/components/subtasks/AcceptanceImageInput";
import { DetailTimeTracker } from "@/components/subtasks/DetailTimeTracker";
import { projectService } from "@/services/project-service";
import { taskService } from "@/services/task-service";
import { subtaskService } from "@/services/subtask-service";
import type { ProjectDirectoryItem, ProjectMember } from "@/types/project";
import type { TaskFileAttachment, TaskLinkAttachment, WorkTaskDirectoryItem } from "@/types/task";
import { SUBTASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS } from "@/types/task";
import { detailTaskProgressPercent, emptyAcceptanceRow, INITIAL_HANDOVER_SOURCE_ID } from "@/lib/handover";
import type { AcceptanceRow, Subtask, SubtaskReport, SubtaskTestHistoryEntry, SubtaskTimeRecord } from "@/types/subtask";
import { isSubtaskOverdue } from "@/types/subtask";
import { AvatarStack } from "@/components/ui/Avatar";
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
import { TaskAttachmentPopup } from "@/components/tasks/TaskAttachmentPopup";
import { AcceptanceMinutesPopup } from "@/components/subtasks/AcceptanceMinutesPopup";
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

type IterationDraft = {
  id: string | null;
  title: string;
  description: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
  acceptance: AcceptanceRow;
};

function taskDetailName(description?: string): string {
  return description?.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    ?.replace(/^#{1,6}\s+/, "").slice(0, 120) || "Chi tiết chưa có tên";
}

function emptyIterationDraft(): IterationDraft {
  return {
    id: null,
    title: "",
    description: "",
    files: [],
    links: [],
    images: [],
    acceptance: emptyAcceptanceRow(),
  };
}

interface SubtaskDetailViewProps {
  subtaskId: string;
  initialSubtask: Subtask | null;
  initialWorkTasks: WorkTaskDirectoryItem[];
  initialReports: SubtaskReport[];
  initialMembers: ProjectMember[];
  initialTestHistory: SubtaskTestHistoryEntry[];
}

const SUBTASK_ACCEPTED_EVENT = "app:subtask-accepted";

export function SubtaskDetailView({
  subtaskId,
  initialSubtask,
  initialWorkTasks,
  initialReports,
  initialMembers,
  initialTestHistory,
}: SubtaskDetailViewProps) {
  const router = useRouter();
  const { notify, confirm } = useFeedback();
  const { account } = useCurrentAccount();
  const cache = useSessionDataCache();
  const splitView = useSplitView();
  const [subtask, setSubtask] = useState<Subtask | null>(initialSubtask);
  const [workTasks, setWorkTasks] = useState<WorkTaskDirectoryItem[]>(initialWorkTasks);
  const [reports, setReports] = useState<SubtaskReport[]>(initialReports);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [projects, setProjects] = useState<ProjectDirectoryItem[]>([]);
  const [testHistory, setTestHistory] = useState<SubtaskTestHistoryEntry[]>(initialTestHistory);
  const [timeRecords, setTimeRecords] = useState<SubtaskTimeRecord[]>([]);
  const [savingTimeRecord, setSavingTimeRecord] = useState(false);
  const [timeRecordsReady, setTimeRecordsReady] = useState(false);
  const [iterationEditor, setIterationEditor] = useState<IterationDraft | null>(null);
  const [selectedDetailIds, setSelectedDetailIds] = useState<string[]>([]);
  const [savingIteration, setSavingIteration] = useState(false);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);
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
  const [promptDetailId, setPromptDetailId] = useState<string | null>(null);
  const [savingAcceptance, setSavingAcceptance] = useState(false);
  const [exportingDetailPdf, setExportingDetailPdf] = useState(false);
  const [uploadingAcceptanceId, setUploadingAcceptanceId] = useState<string | null>(null);
  const [drawerDetailId, setDrawerDetailId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const hasRunningTimer = timeRecords.some((r) => r.type === "start");
  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  useEffect(() => {
    if (!subtask) return;
    const progress = detailTaskProgressPercent(subtask.updates.map((entry) => entry.id), subtask.handover?.rows, !subtask.handover?.initialDeleted);
    window.dispatchEvent(new CustomEvent("app:subtask-details-updated", {
      detail: { ...subtask, progress },
    }));
  }, [subtask]);

  const recordTime = useCallback(async (detailId: string, type: SubtaskTimeRecord["type"]) => {
    if (savingTimeRecord) return;
    setSavingTimeRecord(true);
    try {
      setTimeRecords(await subtaskService.appendTimeRecord(subtaskId, type, detailId));
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

  const load = useCallback(async () => {
    try {
      const subtaskData = await subtaskService.getSubtaskById(subtaskId);
      setSubtask(subtaskData);
      setError(false);
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
  }, [subtaskId, notify, tab]);

  async function saveAcceptance(sourceId: string, patch: Partial<AcceptanceRow>) {
    if (!subtask || savingAcceptance || deletingDetailId) {
      throw new Error("Đang lưu thay đổi khác. Vui lòng thử lưu ảnh lại.");
    }
    const current = subtask.handover?.rows?.[sourceId] ?? emptyAcceptanceRow();
    const rows = {
      ...(subtask.handover?.rows ?? {}),
      [sourceId]: { ...current, ...patch },
    };
    const statuses = Object.fromEntries(
      Object.entries(rows).map(([id, row]) => [id, row.status === "accepted" ? "handedOver" as const : "pending" as const]),
    );
    const previousHandover = subtask.handover;
    const nextHandover = {
      initialDeleted: subtask.handover?.initialDeleted,
      titles: subtask.handover?.titles,
      text: rows[INITIAL_HANDOVER_SOURCE_ID]?.note ?? "",
      imageUrl: rows[INITIAL_HANDOVER_SOURCE_ID]?.imageUrl ?? "",
      statuses,
      rows,
    };
    const taskId = subtask.id;
    setSavingAcceptance(true);
    setSubtask((currentSubtask) => currentSubtask?.id === taskId ? {
      ...currentSubtask,
      handover: nextHandover,
      progress: detailTaskProgressPercent(currentSubtask.updates.map((entry) => entry.id), rows, !nextHandover.initialDeleted),
    } : currentSubtask);
    try {
      const handover = await subtaskService.updateHandover(taskId, nextHandover);
      setSubtask((currentSubtask) => currentSubtask?.id === taskId ? {
        ...currentSubtask,
        handover,
        progress: detailTaskProgressPercent(currentSubtask.updates.map((entry) => entry.id), handover.rows, !handover.initialDeleted),
      } : currentSubtask);
    } catch (saveError) {
      setSubtask((currentSubtask) => currentSubtask?.id === taskId ? {
        ...currentSubtask,
        handover: previousHandover,
        progress: detailTaskProgressPercent(currentSubtask.updates.map((entry) => entry.id), previousHandover?.rows, !previousHandover?.initialDeleted),
      } : currentSubtask);
      notify({
        type: "error",
        title: "Không thể lưu nghiệm thu",
        description: getErrorMessage(saveError, "Vui lòng thử lại."),
      });
      throw saveError;
    } finally {
      setSavingAcceptance(false);
    }
  }

  async function uploadAcceptanceImage(sourceId: string, file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      notify({ type: "error", title: "Hãy chọn một ảnh JPG, PNG, WEBP hoặc AVIF." });
      throw new Error("Invalid image");
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
      throw uploadError;
    } finally {
      setUploadingAcceptanceId(null);
    }
  }

  async function uploadDraftAcceptanceImage(file: File | null) {
    if (!file || !file.type.startsWith("image/")) {
      notify({ type: "error", title: "Hãy chọn một ảnh JPG, PNG, WEBP hoặc AVIF." });
      throw new Error("Invalid image");
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
      throw uploadError;
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

  // Load test history and time records after the initial paint.
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([
        subtaskService.getSubtaskTestHistory(subtaskId),
        subtaskService.getTimeRecords(subtaskId),
      ])
        .then(([historyData, timeRecordData]) => {
          if (!active) return;
          setTestHistory(historyData);
          setTimeRecords(timeRecordData);
          setTimeRecordsReady(true);
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
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu Task",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [notify, subtask]);

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
    } catch (updateError) {
      notify({
        type: "error",
        title: "Không thể cập nhật tài liệu Task",
        description: getErrorMessage(updateError, "Vui lòng thử lại."),
      });
      throw updateError;
    }
  }, [notify, subtask]);

  const handleSaveIteration = useCallback(async () => {
    if (!subtask || !iterationEditor || savingIteration || deletingDetailId) return;
    const description = iterationEditor.description.trim();
    const title = iterationEditor.title.trim();
    if (!title) {
      notify({ type: "error", title: "Hãy nhập tiêu đề chi tiết Task." });
      return;
    }

    setSavingIteration(true);
    try {
      if (iterationEditor.id === INITIAL_HANDOVER_SOURCE_ID) {
        const updated = await subtaskService.updateUpdates(subtask.id, subtask.updates, {
          description,
          handover: {
            initialDeleted: subtask.handover?.initialDeleted,
            text: subtask.handover?.text ?? "",
            imageUrl: subtask.handover?.imageUrl ?? "",
            statuses: subtask.handover?.statuses ?? {},
            rows: subtask.handover?.rows ?? {},
            titles: { ...subtask.handover?.titles, [INITIAL_HANDOVER_SOURCE_ID]: title },
          },
        });
        if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
        setSubtask(updated);
        setIterationEditor(null);
        notify({ type: "success", title: "Đã cập nhật chi tiết Task" });
        return;
      }
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
      let handover = {
        initialDeleted: subtask.handover?.initialDeleted,
        text: subtask.handover?.text ?? "",
        imageUrl: subtask.handover?.imageUrl ?? "",
        statuses: subtask.handover?.statuses ?? {},
        rows: subtask.handover?.rows ?? {},
        titles: { ...subtask.handover?.titles, [createdId]: title },
      };
      if (!iterationEditor.id) {
        const rows = {
          ...(subtask.handover?.rows ?? {}),
          [createdId]: iterationEditor.acceptance,
        };
        const statuses = Object.fromEntries(
          Object.entries(rows).map(([id, row]) => [id, row.status === "accepted" ? "handedOver" as const : "pending" as const]),
        );
        handover = {
            initialDeleted: handover.initialDeleted,
            titles: handover.titles,
            text: rows[INITIAL_HANDOVER_SOURCE_ID]?.note ?? "",
            imageUrl: rows[INITIAL_HANDOVER_SOURCE_ID]?.imageUrl ?? "",
            statuses,
            rows,
        };
      }
      const updated = await subtaskService.updateUpdates(subtask.id, updates, handover ? { handover } : {});
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      setSubtask(updated);
      setIterationEditor(null);
      notify({ type: "success", title: iterationEditor.id ? "Đã cập nhật chi tiết Task" : "Đã thêm chi tiết Task" });
    } catch (saveError) {
      notify({ type: "error", title: "Không thể lưu chi tiết Task", description: getErrorMessage(saveError, "Vui lòng thử lại.") });
    } finally {
      setSavingIteration(false);
    }
  }, [iterationEditor, notify, savingIteration, subtask]);

  async function handleDeleteDetail(sourceId: string, title: string) {
    if (!subtask || subtask.status === "done" || deletingDetailId || savingIteration || savingAcceptance) return;
    const approved = await confirm({
      title: "Xóa chi tiết Task?",
      description: `Chi tiết “${title}” sẽ bị xóa khỏi Task.`,
      confirmLabel: "Xóa chi tiết",
      tone: "danger",
    });
    if (!approved) return;
    const taskId = subtask.id;
    const previousUpdates = subtask.updates;
    const previousHandover = subtask.handover;
    setDeletingDetailId(sourceId);
    try {
      const handover = {
        text: subtask.handover?.text ?? "",
        imageUrl: subtask.handover?.imageUrl ?? "",
        statuses: { ...subtask.handover?.statuses },
        rows: { ...subtask.handover?.rows },
        titles: { ...subtask.handover?.titles },
        initialDeleted: sourceId === INITIAL_HANDOVER_SOURCE_ID || subtask.handover?.initialDeleted === true,
      };
      delete handover.rows[sourceId];
      delete handover.statuses[sourceId];
      delete handover.titles[sourceId];
      if (sourceId === INITIAL_HANDOVER_SOURCE_ID) {
        handover.text = "";
        handover.imageUrl = "";
      }
      const updates = subtask.updates.filter((entry) => entry.id !== sourceId);
      setSubtask((current) => current?.id === taskId ? {
        ...current,
        updates,
        handover,
        progress: detailTaskProgressPercent(updates.map((entry) => entry.id), handover.rows, !handover.initialDeleted),
      } : current);
      const updated = await subtaskService.updateUpdates(taskId, updates, { handover });
      if (!updated) throw new Error("Task không tồn tại hoặc đã bị xóa.");
      setSubtask((current) => current?.id === taskId ? {
        ...current,
        updates: updated.updates,
        handover: updated.handover,
        progress: updated.progress,
      } : current);
      setIterationEditor(null);
      cache.invalidate(CACHE_RESOURCE.tasksList);
      notify({ type: "success", title: "Đã xóa chi tiết Task" });
    } catch (error) {
      setSubtask((current) => current?.id === taskId ? {
        ...current,
        updates: previousUpdates,
        handover: previousHandover,
        progress: detailTaskProgressPercent(previousUpdates.map((entry) => entry.id), previousHandover?.rows, !previousHandover?.initialDeleted),
      } : current);
      notify({ type: "error", title: "Không thể xóa chi tiết Task", description: getErrorMessage(error, "Vui lòng thử lại.") });
    } finally {
      setDeletingDetailId(null);
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
  const detailIds = [...(!subtask.handover?.initialDeleted ? [INITIAL_HANDOVER_SOURCE_ID] : []), ...subtask.updates.map((entry) => entry.id)];
  const selectedVisibleDetailIds = detailIds.filter((id) => selectedDetailIds.includes(id));
  const canUpdateStatus = account?.role === "admin" || (account?.role === "member" && !isTester);
  const statusOptions = account?.role === "member" && !statusLocked
    ? SUBTASK_STATUS_OPTIONS.filter((option) => option.value !== "done")
    : SUBTASK_STATUS_OPTIONS;
  const actualProgress = detailTaskProgressPercent(
    subtask.updates.map((entry) => entry.id),
    subtask.handover?.rows,
    !subtask.handover?.initialDeleted,
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
            <section>
              <Panel
                accentClassName="bg-violet-600"
                icon={Info}
                iconClassName="text-violet-600"
                title="Chi tiết Task"
                subtitle={deletingDetailId ? "Đang lưu thay đổi xóa chi tiết..." : savingAcceptance ? "Đang lưu trạng thái chi tiết..." : "Mô tả Task và thời hạn thực hiện chi tiết"}
                headerAction={<div className="flex flex-wrap gap-2">
                  <AcceptanceMinutesPopup task={subtask} selectedIds={selectedVisibleDetailIds} workTaskTitle={workTask?.title} disabled={savingAcceptance || savingIteration || Boolean(deletingDetailId)} />
                  <Button type="button" variant="secondary" size="sm"
                    disabled={exportingDetailPdf || savingAcceptance || savingIteration || Boolean(deletingDetailId)}
                    title="Mở hộp thoại in từ các chi tiết đã lưu"
                    onClick={async () => {
                      const printWindow = window.open("", "_blank");
                      if (!printWindow) {
                        notify({ type: "error", title: "Không mở được cửa sổ in", description: "Hãy cho phép cửa sổ bật lên trên trình duyệt rồi thử lại." });
                        return;
                      }
                      printWindow.opener = null;
                      printWindow.document.title = "Đang chuẩn bị báo cáo...";
                      printWindow.document.body.textContent = "Đang chuẩn bị báo cáo để in...";
                      setExportingDetailPdf(true);
                      try {
                        const { exportTaskDetailPdf } = await import("@/lib/task-detail-pdf");
                        await exportTaskDetailPdf(subtask, workTask?.title, printWindow);
                      } catch (error) {
                        printWindow.close();
                        notify({ type: "error", title: "Không thể xuất báo cáo", description: getErrorMessage(error, "Vui lòng thử lại.") });
                      } finally {
                        setExportingDetailPdf(false);
                      }
                    }}>
                    {exportingDetailPdf ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {exportingDetailPdf ? "Đang xuất..." : "In báo cáo"}
                  </Button>
                  {!statusLocked && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIterationEditor(emptyIterationDraft())}
                    disabled={savingIteration || Boolean(iterationEditor) || Boolean(deletingDetailId)}
                  >
                    <Plus className="h-4 w-4" />
                    Thêm chi tiết
                  </Button>
                  )}
                </div>}
              >
                <div className="space-y-3">
                  {/* Smart Table */}
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
                        <caption className="sr-only">Chi tiết Task</caption>
                        <colgroup>
                          <col className="w-10" />
                          <col />
                          <col />
                          <col className="w-40" />
                          <col className="w-32" />
                          <col className="w-32" />
                          <col className="w-72" />
                        </colgroup>
                        <thead className="border-b border-gray-200 bg-gray-50/75 text-left text-xs font-semibold text-gray-500">
                          <tr>
                            <th scope="col" className="px-3 py-3.5 text-center">
                              <input
                                type="checkbox"
                                aria-label="Chọn tất cả chi tiết Task"
                                checked={detailIds.length > 0 && selectedVisibleDetailIds.length === detailIds.length}
                                disabled={detailIds.length === 0}
                                onChange={(event) => setSelectedDetailIds(event.target.checked ? detailIds : [])}
                                className="h-4 w-4 rounded border-gray-300 accent-violet-600 transition"
                              />
                            </th>
                            <th scope="col" className="px-3 py-3.5">Chi tiết công việc</th>
                            <th scope="col" className="px-3 py-3.5">Nội dung tóm tắt</th>
                            <th scope="col" className="px-3 py-3.5">Nghiệm thu</th>
                            <th scope="col" className="px-3 py-3.5">Thời gian</th>
                            <th scope="col" className="px-3 py-3.5">Nhân sự</th>
                            <th scope="col" className="px-3 py-3.5 text-right pr-4">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {[
                            ...(!subtask.handover?.initialDeleted ? [{
                              id: INITIAL_HANDOVER_SOURCE_ID,
                              description: subtask.description,
                              createdAt: subtask.createdAt,
                              files: subtask.files,
                              links: subtask.links,
                              images: subtask.images,
                            }] : []),
                            ...subtask.updates,
                          ].map((entry, index) => {
                            const detailTitle = subtask.handover?.titles?.[entry.id] ?? taskDetailName(entry.description);
                            const acceptance = subtask.handover?.rows?.[entry.id] ?? emptyAcceptanceRow();
                            const statusKey = acceptance.status ?? "pending";
                            const statusStyles: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
                              pending: { label: "Chưa hoàn thành", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
                              testing: { label: "Đang test", bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-500" },
                              tested: { label: "Đã test", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
                              acceptance: { label: "Nghiệm thu", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
                              rework: { label: "Làm lại", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
                              cancelled: { label: "Hủy bỏ", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" },
                              accepted: { label: "Hoàn thành", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
                            };
                            const statusInfo = statusStyles[statusKey] ?? statusStyles.pending;
                            const entryTimeRecords = timeRecords.filter((r) => r.detailId === entry.id);
                            const sessions = taskTimeSessions(entryTimeRecords, now);
                            const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
                            const isTimerActive = entryTimeRecords.at(-1)?.type === "start";
                            const assignedMembers = subtask.assignees.filter((m) => acceptance.assigneeIds?.includes(m.id));
                            const totalAttachments = entry.files.length + entry.links.length + entry.images.length;
                            const isSelected = selectedDetailIds.includes(entry.id);

                            return (
                              <tr
                                key={entry.id}
                                onClick={() => setDrawerDetailId(entry.id)}
                                className={cn(
                                  "group cursor-pointer transition-colors hover:bg-violet-50/40",
                                  isSelected && "bg-violet-50/20"
                                )}
                              >
                                {/* Checkbox */}
                                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    aria-label={`Chọn ${detailTitle} để lập biên bản nghiệm thu`}
                                    checked={isSelected}
                                    onChange={(event) =>
                                      setSelectedDetailIds((current) =>
                                        event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id)
                                      )
                                    }
                                    className="h-4 w-4 rounded border-gray-300 accent-violet-600 transition"
                                  />
                                </td>

                                {/* Chi tiết công việc */}
                                <td className="px-3 py-3">
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="font-semibold text-gray-900 group-hover:text-violet-700 transition line-clamp-1" title={detailTitle}>
                                      {detailTitle}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                                      <span className="font-medium text-gray-400">#{index + 1}</span>
                                      <span>•</span>
                                      <span>{entry.createdAt ? formatDateVN(entry.createdAt) : "—"}</span>
                                    </div>
                                  </div>
                                </td>

                                {/* Nội dung tóm tắt */}
                                <td className="px-3 py-3">
                                  <p className="line-clamp-2 text-xs leading-5 text-gray-600" title={entry.description || "Chưa có mô tả"}>
                                    {entry.description?.trim() || <span className="italic text-gray-400">Chưa có mô tả</span>}
                                  </p>
                                </td>

                                {/* Nghiệm thu (Smart Badge) */}
                                <td className="px-3 py-3">
                                  <div className="flex flex-col items-start gap-1">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-2xs",
                                        statusInfo.bg,
                                        statusInfo.text,
                                        statusInfo.border
                                      )}
                                    >
                                      <span className={cn("h-1.5 w-1.5 rounded-full", statusInfo.dot)} />
                                      {statusInfo.label}
                                    </span>
                                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                      {acceptance.imageUrl && (
                                        <span className="inline-flex items-center gap-0.5 text-emerald-600" title="Đã có ảnh nghiệm thu">
                                          <ImageIcon className="h-3 w-3" /> 1 ảnh
                                        </span>
                                      )}
                                      {acceptance.note && (
                                        <span className="truncate max-w-[120px] text-gray-400 italic" title={acceptance.note}>
                                          “{acceptance.note}”
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Thời gian thực hiện */}
                                <td className="px-3 py-3">
                                  <div
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono font-medium",
                                      isTimerActive
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-xs"
                                        : totalDuration > 0
                                          ? "border-gray-200 bg-gray-50 text-gray-700"
                                          : "border-gray-100 bg-gray-50/50 text-gray-400"
                                    )}
                                  >
                                    <Clock3 className={cn("h-3.5 w-3.5", isTimerActive && "text-emerald-600 animate-spin")} />
                                    <span>{formatSessionDuration(totalDuration)}</span>
                                    {isTimerActive && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    )}
                                  </div>
                                </td>

                                {/* Nhân sự */}
                                <td className="px-3 py-3">
                                  {assignedMembers.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {assignedMembers.slice(0, 2).map((m) => (
                                        <span
                                          key={m.id}
                                          className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 border border-gray-200/60"
                                          title={m.name}
                                        >
                                          {m.name}
                                        </span>
                                      ))}
                                      {assignedMembers.length > 2 && (
                                        <span className="text-[11px] text-gray-400 font-medium">
                                          +{assignedMembers.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">—</span>
                                  )}
                                </td>

                                {/* Thao tác */}
                                <td className="px-3 py-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                                    {!statusLocked && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={savingIteration || Boolean(deletingDetailId) || Boolean(iterationEditor)}
                                        onClick={() => setIterationEditor({
                                          id: entry.id,
                                          title: detailTitle,
                                          description: entry.description ?? "",
                                          files: entry.files,
                                          links: entry.links,
                                          images: entry.images,
                                          acceptance,
                                        })}
                                        aria-label={`Sửa chi tiết ${detailTitle}`}
                                        className="h-8 shrink-0 gap-1.5 whitespace-nowrap text-xs"
                                      >
                                        <Pencil className="h-3.5 w-3.5" /> Sửa
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setDrawerDetailId(entry.id)}
                                      className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 px-3 text-xs font-medium shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                                      title="Mở chi tiết & nghiệm thu"
                                    >
                                      <PanelRightOpen className="h-3.5 w-3.5 shrink-0" />
                                      <span className="whitespace-nowrap">Chi tiết</span>
                                    </Button>

                                    <TaskAttachmentPopup count={totalAttachments} readOnly={statusLocked} compact>
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
                                          compact
                                          files={entry.files}
                                          links={entry.links}
                                          images={entry.images}
                                          onUploadFile={subtaskService.uploadFile}
                                          onUploadImage={subtaskService.uploadImage}
                                          onSave={(value) =>
                                            entry.id === INITIAL_HANDOVER_SOURCE_ID
                                              ? handleAttachmentSave(value)
                                              : handleUpdateAttachmentSave(entry.id, value)
                                          }
                                        />
                                      )}
                                    </TaskAttachmentPopup>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {subtask.handover?.initialDeleted && subtask.updates.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">
                                Chưa có chi tiết Task. Bấm “Thêm chi tiết” để tạo mới.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
                {timeRecords.some((record) => !record.detailId) && (
                  <details className="mt-4 text-xs text-gray-500">
                    <summary className="cursor-pointer">Lịch sử cũ của Task (chưa phân vào chi tiết)</summary>
                    <DetailTimeTracker records={timeRecords.filter((record) => !record.detailId)} disabled readOnly onRecord={() => undefined} />
                  </details>
                )}
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
              taskDetailOptions={[
                ...(!subtask.handover?.initialDeleted ? [{ value: INITIAL_HANDOVER_SOURCE_ID, label: subtask.handover?.titles?.[INITIAL_HANDOVER_SOURCE_ID] ?? taskDetailName(subtask.description) }] : []),
                ...subtask.updates.map((entry) => ({
                  value: entry.id,
                  label: subtask.handover?.titles?.[entry.id] ?? taskDetailName(entry.description),
                })),
              ]}
              initialItems={subtask.promptItems}
              detailId={promptDetailId}
              onCloseDetail={() => setPromptDetailId(null)}
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



            <section className="grid grid-cols-1 gap-5">
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

                  {iterationEditor && !statusLocked && (
                    <NewDetailDialog title={iterationEditor.id === null ? "Thêm chi tiết Task" : "Sửa chi tiết Task"} busy={savingIteration || uploadingAcceptanceId === "draft"} onClose={() => setIterationEditor(null)}>
                      <div className="mb-2 text-sm font-semibold text-violet-800">{iterationEditor.title.trim() || "Chi tiết mới"}</div>
                      <IterationTitleInput value={iterationEditor.title} onChange={(title) => setIterationEditor((current) => current ? { ...current, title } : current)} />
                      <textarea
                        autoFocus
                        maxLength={5000}
                        rows={3}
                        value={iterationEditor.description}
                        onChange={(event) => setIterationEditor((current) => current ? { ...current, description: event.target.value } : current)}
                        aria-label="Nội dung chi tiết Task"
                        placeholder="Nhập nội dung chi tiết..."
                        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      />
                      {iterationEditor.id === null && <><AcceptanceFields
                        key={`${subtask.id}:draft`}
                        members={subtask.assignees}
                        row={iterationEditor.acceptance}
                        disabled={savingIteration || !canEditHandover}
                        uploading={uploadingAcceptanceId === "draft"}
                        onDraftChange={(patch) => setIterationEditor((current) => current
                          ? { ...current, acceptance: { ...current.acceptance, ...patch } }
                          : current)}
                        onSave={() => undefined}
                        onUpload={(file) => uploadDraftAcceptanceImage(file)}
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
                      </>}
                      <div className="mt-2 flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={savingIteration || uploadingAcceptanceId === "draft"} onClick={() => setIterationEditor(null)}>Hủy</Button>
                        <Button type="button" size="sm" disabled={savingIteration || uploadingAcceptanceId === "draft"} onClick={() => void handleSaveIteration()}>{savingIteration ? "Đang lưu..." : "Lưu chi tiết"}</Button>
                      </div>
                    </NewDetailDialog>
                  )}

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

      {/* Task Detail Drawer (Side Sheet phong cách Jira/Linear) */}
      {(() => {
        const allEntries = [
          ...(!subtask.handover?.initialDeleted ? [{
            id: INITIAL_HANDOVER_SOURCE_ID,
            description: subtask.description,
            createdAt: subtask.createdAt,
            files: subtask.files,
            links: subtask.links,
            images: subtask.images,
          }] : []),
          ...subtask.updates,
        ];
        const activeEntry = allEntries.find((e) => e.id === drawerDetailId) ?? null;
        const activeTitle = activeEntry
          ? (subtask.handover?.titles?.[activeEntry.id] ?? taskDetailName(activeEntry.description))
          : "";

        return (
          <TaskDetailDrawer
            isOpen={Boolean(drawerDetailId && activeEntry)}
            onClose={() => setDrawerDetailId(null)}
            subtask={subtask}
            workTaskTitle={workTask?.title}
            detailEntry={activeEntry}
            detailTitle={activeTitle}
            isInitialSource={activeEntry?.id === INITIAL_HANDOVER_SOURCE_ID}
            members={subtask.assignees}
            timeRecords={timeRecords}
            timeRecordsReady={timeRecordsReady}
            savingTimeRecord={savingTimeRecord}
            statusLocked={statusLocked}
            canEditHandover={canEditHandover}
            savingAcceptance={savingAcceptance}
            uploadingAcceptanceId={uploadingAcceptanceId}
            savingIteration={savingIteration}
            deletingDetailId={deletingDetailId}
            onRecordTime={(detailId, type) => void recordTime(detailId, type)}
            onSaveAcceptance={saveAcceptance}
            onUploadAcceptanceImage={uploadAcceptanceImage}
            onDeleteDetail={handleDeleteDetail}
            onStartEdit={(draft) => {
              setDrawerDetailId(null);
              setIterationEditor(draft);
            }}
            onOpenPrompt={(detailId) => setPromptDetailId(detailId)}
            onImportPrompt={(item) => setPromptImport(item)}
            onSaveAttachments={(detailId, value) =>
              detailId === INITIAL_HANDOVER_SOURCE_ID
                ? handleAttachmentSave(value)
                : handleUpdateAttachmentSave(detailId, value)
            }
          />
        );
      })()}

    </div>
  );
}

function NewDetailDialog({ children, title, busy, onClose }: {
  children: React.ReactNode;
  title: string;
  busy: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-task-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-gray-950/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
        <h2 id="new-task-detail-title" className="text-base font-bold text-gray-900">{title}</h2>
        <button type="button" aria-label="Đóng" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </dialog>
  );
}

function IterationTitleInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mb-3 block text-xs font-semibold text-gray-500">
      Tiêu đề
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={500}
        placeholder="Nhập tiêu đề chi tiết..."
        className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </label>
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
