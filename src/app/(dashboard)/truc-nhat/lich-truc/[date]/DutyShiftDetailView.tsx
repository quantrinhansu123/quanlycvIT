"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CalendarDays, PanelRightClose, Save, X } from "lucide-react";
import type { AccountRole } from "@/types/account";
import type { DutyShift } from "@/types/duty";
import { DUTY_STATUS_META } from "@/types/duty";
import type { ProjectMember } from "@/types/project";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { MemberMultiSelect } from "@/components/ui/MemberMultiSelect";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { useSplitView } from "@/components/layout/SplitViewShell";
import { dutyService } from "@/services/duty-service";
import { projectService } from "@/services/project-service";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { getErrorMessage } from "@/lib/errors";
import { cn, formatDateVN, getAppDateKey } from "@/lib/utils";

interface DutyShiftDetailViewProps {
  date: string;
  initialShift: DutyShift;
  accountId: string;
  accountRole: AccountRole;
  employeeCode: string;
}

export function DutyShiftDetailView({
  date,
  initialShift,
  accountId,
  accountRole,
  employeeCode,
}: DutyShiftDetailViewProps) {
  const { notify } = useFeedback();
  const cache = useSessionDataCache();
  const splitView = useSplitView();
  const [shift, setShift] = useState<DutyShift>(initialShift);
  const canManage = accountRole !== "member";
  // Đã được DutyRosterCalendarClient (layout, không remount khi đổi ngày) nạp
  // sẵn vào session cache — ở đây gần như luôn là cache hit, không gọi mạng.
  const { data: membersData } = useSessionQuery<ProjectMember[]>({
    key: canManage
      ? buildCacheKey({ accountId, role: accountRole, resource: CACHE_RESOURCE.directoryMembers })
      : null,
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
  });
  const members = membersData ?? [];
  const [assigneeIds, setAssigneeIds] = useState<string[]>(shift.assignees.map((assignee) => assignee.id));
  const [note, setNote] = useState(shift.note ?? "");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingAll, setTogglingAll] = useState(false);

  const isAssignee = shift.assignees.some((assignee) => assignee.id === employeeCode);
  const canToggleChecklist = canManage || isAssignee;
  const todayKey = getAppDateKey();
  const isDutyDay = date === todayKey;
  const isOverdue = date < todayKey && shift.status !== "hoan_thanh";
  const meta = isOverdue
    ? { label: "Chưa hoàn thành", badge: "bg-rose-100 text-rose-600" }
    : DUTY_STATUS_META[shift.status];
  const doneCount = shift.checklist.filter((item) => item.done).length;
  const allChecklistDone = shift.checklist.length > 0 && doneCount === shift.checklist.length;
  const dirty =
    JSON.stringify([...assigneeIds].sort()) !==
      JSON.stringify(shift.assignees.map((assignee) => assignee.id).sort()) ||
    note !== (shift.note ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await dutyService.upsertShift({ date, assigneeIds, note: note || undefined });
      setShift(updated);
      setAssigneeIds(updated.assignees.map((assignee) => assignee.id));
      setNote(updated.note ?? "");
      notify({ type: "success", title: "Đã lưu lịch trực" });
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể lưu lịch trực",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(itemId: string, done: boolean) {
    setTogglingId(itemId);
    try {
      const result = await dutyService.toggleChecklistItem(itemId, done);
      setShift((current) => ({
        ...current,
        status: result.status,
        checklist: current.checklist.map((item) => (item.id === itemId ? result.item : item)),
      }));
      cache.invalidate(CACHE_RESOURCE.dutyRoster);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể cập nhật đầu việc",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleAll(done: boolean) {
    setTogglingAll(true);
    try {
      for (const item of shift.checklist) {
        if (item.done === done) continue;
        setTogglingId(item.id);
        const result = await dutyService.toggleChecklistItem(item.id, done);
        setShift((current) => ({
          ...current,
          status: result.status,
          checklist: current.checklist.map((currentItem) =>
            currentItem.id === item.id ? result.item : currentItem
          ),
        }));
      }
      cache.invalidate(CACHE_RESOURCE.dutyRoster);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể cập nhật tất cả đầu việc",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    } finally {
      setTogglingId(null);
      setTogglingAll(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <Link
          href="/truc-nhat/lich-truc"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-gray-900">{formatDateVN(date)}</h1>
          <span
            className={cn(
              "mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
              meta.badge
            )}
          >
            {meta.label}
          </span>
        </div>
        {splitView && !splitView.maximized && (
          <button
            type="button"
            onClick={splitView.toggleDetailCollapsed}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:flex"
            aria-label="Thu gọn khung chi tiết"
            title="Thu gọn"
          >
            <PanelRightClose className="h-5 w-5" />
          </button>
        )}
        <Link
          href="/truc-nhat/lich-truc"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Đóng chi tiết ca trực"
          title="Đóng"
        >
          <X className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Người trực</h2>
          {canManage ? (
            <MemberMultiSelect
              options={members}
              value={assigneeIds}
              onChange={setAssigneeIds}
              placeholder="Chọn người trực..."
            />
          ) : shift.assignees.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {shift.assignees.map((assignee) => (
                <span
                  key={assignee.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 py-1.5 pl-1.5 pr-3 text-sm text-gray-700"
                >
                  <Avatar name={assignee.name} color={assignee.avatarColor} size="sm" />
                  {assignee.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Chưa phân công người trực.</p>
          )}
        </section>

        {canManage ? (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Ghi chú</h2>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Ghi chú cho ca trực này..."
              className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </section>
        ) : (
          shift.note && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Ghi chú</h2>
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{shift.note}</p>
            </section>
          )
        )}

        {canManage && (
          <div className="mb-6">
            <Button onClick={handleSave} disabled={saving || !dirty || assigneeIds.length === 0}>
              <Save className="h-4 w-4" />
              {saving ? "Đang lưu..." : "Lưu lịch trực"}
            </Button>
          </div>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Đầu việc trực nhật</h2>
            {shift.checklist.length > 0 && (
              <div className="flex items-center gap-3">
                {isDutyDay && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={allChecklistDone}
                      disabled={!canToggleChecklist || togglingAll || !shift.id}
                      onChange={(event) => handleToggleAll(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                      aria-label="Hoàn thành tất cả đầu việc trực nhật"
                    />
                    Hoàn thành tất cả
                  </label>
                )}
                <span className="text-xs text-gray-400">
                  {doneCount}/{shift.checklist.length} hoàn thành
                </span>
              </div>
            )}
          </div>
          {shift.checklist.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có đầu việc nào cho ca trực này.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shift.checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
                >
                  {isDutyDay && (
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canToggleChecklist || togglingAll || togglingId === item.id || !shift.id}
                      onChange={(event) => handleToggle(item.id, event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                    />
                  )}
                  <span
                    className={cn("flex-1 text-sm", item.done ? "text-gray-400 line-through" : "text-gray-700")}
                  >
                    {item.name}
                  </span>
                  {item.done && item.doneBy && (
                    <span className="text-xs text-gray-400">{item.doneBy.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
