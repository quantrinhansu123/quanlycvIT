"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Pencil,
  Send,
  Trash2,
  UserCheck,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatDateVN } from "@/lib/utils";
import type { ProjectMember } from "@/types/project";
import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";
import type { AcceptanceRow, Subtask, SubtaskPromptItem, SubtaskTimeRecord } from "@/types/subtask";
import { INITIAL_HANDOVER_SOURCE_ID } from "@/lib/handover";
import { AcceptanceFields } from "./AcceptanceFields";
import { DetailTimeTracker } from "./DetailTimeTracker";
import { AcceptanceMinutesPopup } from "./AcceptanceMinutesPopup";
import { SubtaskPromptPanel, type SubtaskPromptImportRequest } from "./SubtaskPromptPanel";
import { TaskAttachmentPopup } from "@/components/tasks/TaskAttachmentPopup";
import { DetailAttachments } from "@/components/tasks/DetailAttachments";
import { InlineTaskAttachmentEditor } from "@/components/tasks/InlineTaskAttachmentEditor";
import { subtaskService } from "@/services/subtask-service";

function taskDetailName(description?: string): string {
  return description?.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    ?.replace(/^#{1,6}\s+/, "").slice(0, 120) || "Chi tiết chưa có tên";
}

interface TaskDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subtask: Subtask;
  workTaskTitle?: string;
  detailEntry: {
    id: string;
    description?: string;
    createdAt?: string;
    files: TaskFileAttachment[];
    links: TaskLinkAttachment[];
    images: string[];
  } | null;
  detailTitle: string;
  isInitialSource: boolean;
  members: ProjectMember[];
  timeRecords: SubtaskTimeRecord[];
  timeRecordsReady: boolean;
  savingTimeRecord: boolean;
  statusLocked: boolean;
  canEditHandover: boolean;
  savingAcceptance: boolean;
  uploadingAcceptanceId: string | null;
  savingIteration: boolean;
  deletingDetailId: string | null;
  onRecordTime: (detailId: string, type: SubtaskTimeRecord["type"]) => void;
  onSaveAcceptance: (detailId: string, patch: Partial<AcceptanceRow>) => void | Promise<void>;
  onUploadAcceptanceImage: (detailId: string, file: File) => Promise<void>;
  onDeleteDetail: (detailId: string, title: string) => void | Promise<void>;
  onStartEdit: (entry: {
    id: string;
    title: string;
    description: string;
    files: TaskFileAttachment[];
    links: TaskLinkAttachment[];
    images: string[];
    acceptance: AcceptanceRow;
  }) => void;
  onOpenPrompt: (detailId: string) => void;
  onPromptItemsChange: (items: SubtaskPromptItem[]) => void;
  onImportPrompt: (entry: {
    requestId: string;
    taskTitle: string;
    content: string;
    imageUrls: string[];
  }) => void;
  onSaveAttachments: (
    detailId: string,
    value: {
      files: TaskFileAttachment[];
      links: TaskLinkAttachment[];
      images: string[];
    }
  ) => Promise<void>;
}

export function TaskDetailDrawer({
  isOpen,
  onClose,
  subtask,
  workTaskTitle,
  detailEntry,
  detailTitle,
  members,
  timeRecords,
  timeRecordsReady,
  savingTimeRecord,
  statusLocked,
  canEditHandover,
  savingAcceptance,
  uploadingAcceptanceId,
  savingIteration,
  deletingDetailId,
  onRecordTime,
  onSaveAcceptance,
  onUploadAcceptanceImage,
  onDeleteDetail,
  onStartEdit,
  onOpenPrompt,
  onPromptItemsChange,
  onImportPrompt,
  onSaveAttachments,
}: TaskDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"acceptance" | "time" | "prompt" | "assignees" | "attachments">("acceptance");
  const [drawerPromptImport, setDrawerPromptImport] = useState<SubtaskPromptImportRequest | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Đóng khi nhấn phím Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !detailEntry) return null;

  const entry = detailEntry;
  const acceptanceRow = subtask.handover?.rows?.[entry.id] ?? {
    status: "pending",
    note: "",
    imageUrl: "",
    assigneeIds: [],
  };

  const currentStatus = acceptanceRow.status ?? "pending";
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "Chưa hoàn thành", color: "bg-amber-50 text-amber-700 border-amber-200" },
    testing: { label: "Đang test", color: "bg-sky-50 text-sky-700 border-sky-200" },
    tested: { label: "Đã test", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    acceptance: { label: "Nghiệm thu", color: "bg-purple-50 text-purple-700 border-purple-200" },
    rework: { label: "Làm lại", color: "bg-rose-50 text-rose-700 border-rose-200" },
    cancelled: { label: "Hủy bỏ", color: "bg-gray-100 text-gray-600 border-gray-200" },
    accepted: { label: "Hoàn thành", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };

  const statusBadge = statusLabels[currentStatus] || statusLabels.pending;
  const totalAttachments = entry.files.length + entry.links.length + entry.images.length;
  const assignedCount = acceptanceRow.assigneeIds?.length ?? 0;
  const detailRecords = timeRecords.filter((record) => record.detailId === entry.id);
  const isTimerRunning = detailRecords.at(-1)?.type === "start";
  const promptCount = subtask.promptItems.filter((item) => item.taskTitle === entry.id).length;

  const tabs = [
    {
      id: "acceptance" as const,
      label: "Nghiệm thu",
      icon: FileCheck2,
      badge: statusBadge.label,
      badgeColor: statusBadge.color,
    },
    {
      id: "time" as const,
      label: "Bấm giờ",
      icon: Clock3,
      isTimer: isTimerRunning,
      count: detailRecords.length > 0 ? `${detailRecords.length} sự kiện` : undefined,
    },
    {
      id: "prompt" as const,
      label: "Prompt",
      icon: MessageSquareText,
      count: promptCount > 0 ? `${promptCount}` : undefined,
    },
    {
      id: "assignees" as const,
      label: "Nhân sự",
      icon: UserCheck,
      count: assignedCount > 0 ? `${assignedCount}` : undefined,
    },
    {
      id: "attachments" as const,
      label: "Tệp đính kèm",
      icon: Paperclip,
      count: totalAttachments > 0 ? `${totalAttachments}` : undefined,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <div className={cn("fixed inset-y-0 right-0 flex max-w-full transition-all duration-300", isMaximized ? "pl-0" : "pl-6 sm:pl-10")}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={detailTitle}
          className={cn(
            "flex flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300 border-l border-gray-200 transition-all",
            isMaximized
              ? "w-screen max-w-full"
              : "w-screen max-w-5xl lg:max-w-6xl xl:max-w-[1360px]"
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-6 py-4 bg-gradient-to-r from-violet-50/50 via-white to-white">
            <div className="min-w-0 flex-1 pr-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    statusBadge.color
                  )}
                >
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                  {statusBadge.label}
                </span>
                {entry.createdAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateVN(entry.createdAt)}
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 truncate text-lg font-bold text-gray-900" title={detailTitle}>
                {detailTitle}
              </h2>
            </div>

            {/* Header Actions */}
            <div className="flex flex-wrap items-center justify-end gap-1">
              <AcceptanceMinutesPopup
                task={subtask}
                selectedIds={[entry.id]}
                workTaskTitle={workTaskTitle}
                directPrint
                disabled={savingAcceptance || savingIteration || uploadingAcceptanceId === entry.id || Boolean(deletingDetailId)}
              />

              <button
                type="button"
                onClick={() => setActiveTab("prompt")}
                title="Xem Prompt"
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition cursor-pointer",
                  activeTab === "prompt"
                    ? "border-sky-300 bg-sky-100 text-sky-800 font-semibold"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                )}
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Prompt
              </button>

              <button
                type="button"
                onClick={() => {
                  setDrawerPromptImport({
                    requestId: crypto.randomUUID(),
                    taskTitle: entry.id,
                    content: entry.description ?? "",
                    imageUrls: entry.images,
                  });
                  setActiveTab("prompt");
                }}
                disabled={!entry.description?.trim() && entry.images.length === 0}
                title="Đưa vào Prompt"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-700 hover:bg-sky-50 transition disabled:opacity-40 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>

              {!statusLocked && (
                <button
                  type="button"
                  onClick={() =>
                    onStartEdit({
                      id: entry.id,
                      title: detailTitle,
                      description: entry.description ?? "",
                      files: entry.files,
                      links: entry.links,
                      images: entry.images,
                      acceptance: acceptanceRow,
                    })
                  }
                  disabled={savingIteration || Boolean(deletingDetailId)}
                  title="Chỉnh sửa chi tiết"
                  aria-label={`Sửa chi tiết ${detailTitle}`}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100 transition cursor-pointer disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Sửa
                </button>
              )}

              {!statusLocked && canEditHandover && (
                <button
                  type="button"
                  onClick={() => void onDeleteDetail(entry.id, detailTitle)}
                  disabled={Boolean(deletingDetailId) || savingIteration || savingAcceptance}
                  title="Xóa chi tiết"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer"
                aria-label={isMaximized ? "Thu nhỏ lại" : "Phóng to toàn màn hình"}
                title={isMaximized ? "Thu nhỏ lại" : "Phóng to toàn màn hình"}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition cursor-pointer"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tab Bar Navigation */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-gray-50/80 px-6 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition cursor-pointer",
                    isActive
                      ? "bg-white text-violet-700 shadow-xs border border-gray-200 font-semibold"
                      : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-violet-600" : "text-gray-400")} />
                  <span>{tab.label}</span>
                  {tab.isTimer && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Đang tính giờ" />
                  )}
                  {tab.count && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                        isActive ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Drawer Content (Rendered by Active Tab) */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Tab 1: Nghiệm thu kết quả */}
            {activeTab === "acceptance" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <h3 className="text-base font-bold text-gray-800">Nghiệm thu kết quả</h3>
                      <p className="text-xs text-gray-500">Cập nhật trạng thái, ghi chú và hình ảnh minh chứng nghiệm thu.</p>
                    </div>
                  </div>
                </div>
                <AcceptanceFields
                  compact={false}
                  hideMembers={true}
                  members={subtask.assignees}
                  row={acceptanceRow}
                  disabled={!canEditHandover || savingAcceptance || Boolean(deletingDetailId)}
                  uploading={uploadingAcceptanceId === entry.id}
                  onSave={(patch) => onSaveAcceptance(entry.id, patch)}
                  onUpload={(file) => onUploadAcceptanceImage(entry.id, file)}
                />
              </div>
            )}

            {/* Tab 2: Theo dõi thời gian */}
            {activeTab === "time" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-amber-600" />
                  <div>
                    <h3 className="text-base font-bold text-gray-800">Theo dõi thời gian</h3>
                    <p className="text-xs text-gray-500">Quản lý và ghi nhận thời gian làm việc thực tế trên chi tiết này.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
                  <DetailTimeTracker
                    records={detailRecords}
                    disabled={statusLocked || savingTimeRecord || !timeRecordsReady || Boolean(deletingDetailId)}
                    onRecord={(type) => onRecordTime(entry.id, type)}
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Prompt chi tiết Task */}
            <div hidden={activeTab !== "prompt"}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-sky-600" />
                    <div>
                      <h3 className="text-base font-bold text-gray-800">Prompt chi tiết Task</h3>
                      <p className="text-xs text-gray-500">Soạn thảo, sao chép và quản lý Prompt phục vụ cho “{detailTitle}”.</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDrawerPromptImport({
                        requestId: crypto.randomUUID(),
                        taskTitle: entry.id,
                        content: entry.description ?? "",
                        imageUrls: entry.images,
                      });
                    }}
                    disabled={!entry.description?.trim() && entry.images.length === 0}
                    className="rounded-lg text-xs border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" /> Đưa mô tả vào Prompt
                  </Button>
                </div>

                {entry.description?.trim() && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 text-xs text-gray-700 leading-5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-500">Mô tả tác vụ:</span>
                      {!statusLocked && (
                        <button
                          type="button"
                          onClick={() =>
                            onStartEdit({
                              id: entry.id,
                              title: detailTitle,
                              description: entry.description ?? "",
                              files: entry.files,
                              links: entry.links,
                              images: entry.images,
                              acceptance: acceptanceRow,
                            })
                          }
                          className="text-[11px] font-medium text-violet-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" /> Sửa
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap">{entry.description}</p>
                  </div>
                )}

                <SubtaskPromptPanel
                  key={`${subtask.id}-${entry.id}`}
                  subtaskId={subtask.id}
                  taskDetailOptions={[
                    ...(!subtask.handover?.initialDeleted ? [{ value: INITIAL_HANDOVER_SOURCE_ID, label: subtask.handover?.titles?.[INITIAL_HANDOVER_SOURCE_ID] ?? taskDetailName(subtask.description) }] : []),
                    ...subtask.updates.map((e) => ({
                      value: e.id,
                      label: subtask.handover?.titles?.[e.id] ?? taskDetailName(e.description),
                    })),
                  ]}
                  initialItems={subtask.promptItems}
                  onItemsChange={onPromptItemsChange}
                  detailId={entry.id}
                  initialDataLoaded
                  inline
                  importRequest={drawerPromptImport}
                  onImported={(requestId) => {
                    setDrawerPromptImport((current) => current?.requestId === requestId ? null : current);
                  }}
                />
              </div>
            </div>

            {/* Tab 4: Nhân sự thực hiện */}
            {activeTab === "assignees" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-indigo-600" />
                    <div>
                      <h3 className="text-base font-bold text-gray-800">Nhân sự thực hiện chi tiết</h3>
                      <p className="text-xs text-gray-500">Chọn thành viên tham gia hoàn thành chi tiết này.</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200">
                    {assignedCount} nhân sự
                  </span>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
                  <fieldset
                    disabled={!canEditHandover || savingAcceptance || Boolean(deletingDetailId)}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                  >
                    {subtask.assignees.map((member) => {
                      const isChecked = acceptanceRow.assigneeIds?.includes(member.id) ?? false;
                      return (
                        <label
                          key={member.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition text-xs font-medium",
                            isChecked
                              ? "border-violet-300 bg-violet-50/70 text-violet-900 shadow-2xs"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const ids = acceptanceRow.assigneeIds ?? [];
                              void onSaveAcceptance(entry.id, {
                                assigneeIds: e.target.checked
                                  ? [...ids, member.id]
                                  : ids.filter((id) => id !== member.id),
                              });
                            }}
                            className="h-4 w-4 rounded border-gray-300 accent-violet-600"
                          />
                          <span className="truncate">{member.name}</span>
                        </label>
                      );
                    })}
                    {subtask.assignees.length === 0 && (
                      <p className="text-xs text-gray-400 col-span-full py-4 text-center">Task chưa gán nhân sự phụ trách.</p>
                    )}
                  </fieldset>
                </div>
              </div>
            )}

            {/* Tab 5: Tệp & Tài liệu đính kèm */}
            {activeTab === "attachments" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-violet-600" />
                    <div>
                      <h3 className="text-base font-bold text-gray-800">Tệp & Tài liệu đính kèm</h3>
                      <p className="text-xs text-gray-500">Tải lên tệp, hình ảnh hoặc liên kết tham khảo.</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                    {totalAttachments} mục
                  </span>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
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
                      onSave={(value) => onSaveAttachments(entry.id, value)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
