"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarClock, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ModalLoadingFallback } from "@/components/ui/ModalLoadingFallback";
import { EmptyState } from "@/components/ui/EmptyState";
import { AvatarStack } from "@/components/ui/Avatar";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { useSessionDataCache } from "@/components/providers/SessionDataCacheProvider";
import { useCurrentAccount } from "@/hooks/useCurrentAccount";
import { useSessionQuery } from "@/hooks/useSessionQuery";
import { buildCacheKey } from "@/lib/client-cache/session-data-cache";
import { CACHE_TTL } from "@/lib/client-cache/ttl";
import { CACHE_RESOURCE } from "@/lib/client-cache/resources";
import { getErrorMessage } from "@/lib/errors";
import { formatDateVN, getAppDateKey } from "@/lib/utils";
import { dutyService } from "@/services/duty-service";
import { projectService } from "@/services/project-service";
import type {
  DutyChecklistTemplate,
  DutyChecklistTemplateInput,
  DutyRecurringRule,
  DutyRecurringRuleInput,
} from "@/types/duty";
import { DUTY_WEEKDAY_OPTIONS } from "@/types/duty";
import type { ProjectMember } from "@/types/project";

const DutyRuleFormModal = dynamic(
  () => import("@/components/duty/DutyRuleFormModal").then((mod) => mod.DutyRuleFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);
const DutyTemplateFormModal = dynamic(
  () => import("@/components/duty/DutyTemplateFormModal").then((mod) => mod.DutyTemplateFormModal),
  { ssr: false, loading: () => <ModalLoadingFallback /> }
);

type Tab = "rules" | "templates";

export function DutyConfigPage() {
  const { notify, confirm } = useFeedback();
  const cache = useSessionDataCache();
  const { account } = useCurrentAccount();
  const accountId = account?.id;
  const accountRole = account?.role;
  const [tab, setTab] = useState<Tab>("rules");
  const [editingRule, setEditingRule] = useState<DutyRecurringRule | "new" | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<DutyChecklistTemplate | "new" | null>(null);

  // Cache theo session (giống trang lịch trực) — quay lại trang này sau khi
  // điều hướng đi nơi khác sẽ hiện ngay dữ liệu cũ thay vì phải tải lại từ đầu.
  const rulesQuery = useSessionQuery<DutyRecurringRule[]>({
    key: accountId
      ? buildCacheKey({ accountId, role: accountRole ?? "member", resource: CACHE_RESOURCE.dutyRules })
      : null,
    fetcher: (signal) => dutyService.getRecurringRules({ signal }),
    ttl: CACHE_TTL.list,
  });
  const templatesQuery = useSessionQuery<DutyChecklistTemplate[]>({
    key: accountId
      ? buildCacheKey({ accountId, role: accountRole ?? "member", resource: CACHE_RESOURCE.dutyTemplates })
      : null,
    fetcher: (signal) => dutyService.getChecklistTemplates({ signal }),
    ttl: CACHE_TTL.list,
  });
  const membersQuery = useSessionQuery<ProjectMember[]>({
    key: accountId
      ? buildCacheKey({ accountId, role: accountRole ?? "member", resource: CACHE_RESOURCE.directoryMembers })
      : null,
    fetcher: (signal) => projectService.getDirectory({ signal }),
    ttl: CACHE_TTL.directory,
  });

  const rules = rulesQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const loading = rulesQuery.status === "loading" || templatesQuery.status === "loading";

  useEffect(() => {
    if (!rulesQuery.error) return;
    notify({
      type: "error",
      title: "Không thể tải lịch lặp hằng tuần",
      description: getErrorMessage(rulesQuery.error, "Vui lòng thử lại."),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesQuery.error]);

  useEffect(() => {
    if (!templatesQuery.error) return;
    notify({
      type: "error",
      title: "Không thể tải đầu việc mẫu",
      description: getErrorMessage(templatesQuery.error, "Vui lòng thử lại."),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesQuery.error]);

  useEffect(() => {
    if (!membersQuery.error) return;
    notify({
      type: "error",
      title: "Không thể tải danh sách nhân sự",
      description: getErrorMessage(membersQuery.error, "Vui lòng thử lại."),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersQuery.error]);

  async function handleSaveRule(input: DutyRecurringRuleInput) {
    if (editingRule && editingRule !== "new") {
      await dutyService.updateRecurringRule(editingRule.id, input);
      notify({ type: "success", title: "Đã cập nhật quy tắc lịch trực" });
    } else {
      await dutyService.createRecurringRule(input);
      notify({ type: "success", title: "Đã tạo quy tắc lịch trực" });
    }
    setEditingRule(null);
    rulesQuery.refresh();
    cache.invalidate(CACHE_RESOURCE.dutyRoster);
  }

  async function handleDeleteRule(rule: DutyRecurringRule) {
    const weekdayLabel = DUTY_WEEKDAY_OPTIONS.find((weekday) => weekday.value === rule.weekday)?.label;
    const confirmed = await confirm({
      title: "Xóa quy tắc lịch trực?",
      description: `Xóa quy tắc trực ${weekdayLabel} hằng tuần và các ca được sinh từ quy tắc này. Các ca đã chỉnh riêng vẫn được giữ lại.`,
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await dutyService.deleteRecurringRule(rule.id);
      notify({ type: "success", title: "Đã xóa quy tắc lịch trực" });
      rulesQuery.refresh();
      cache.invalidate(CACHE_RESOURCE.dutyRoster);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể xóa quy tắc lịch trực",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    }
  }

  async function handleSaveTemplate(input: DutyChecklistTemplateInput) {
    if (editingTemplate && editingTemplate !== "new") {
      await dutyService.updateChecklistTemplate(editingTemplate.id, input);
      notify({ type: "success", title: "Đã cập nhật đầu việc mẫu" });
    } else {
      await dutyService.createChecklistTemplate(input);
      notify({ type: "success", title: "Đã tạo đầu việc mẫu" });
    }
    setEditingTemplate(null);
    templatesQuery.refresh();
    cache.invalidate(CACHE_RESOURCE.dutyRoster);
  }

  async function handleDeleteTemplate(template: DutyChecklistTemplate) {
    const confirmed = await confirm({
      title: "Xóa đầu việc mẫu?",
      description: `Xóa "${template.name}" khỏi danh sách đầu việc mẫu. Các ca trực đã chốt trước đó vẫn giữ nguyên checklist.`,
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await dutyService.deleteChecklistTemplate(template.id);
      notify({ type: "success", title: "Đã xóa đầu việc mẫu" });
      templatesQuery.refresh();
      cache.invalidate(CACHE_RESOURCE.dutyRoster);
    } catch (error) {
      notify({
        type: "error",
        title: "Không thể xóa đầu việc mẫu",
        description: getErrorMessage(error, "Vui lòng thử lại."),
      });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cấu hình trực nhật</h1>
          <p className="mt-1 text-sm text-gray-500">
            Thiết lập lịch trực lặp lại hằng tuần và danh sách đầu việc mẫu áp dụng cho mỗi ca trực.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "rules" ? (
            <Button onClick={() => setEditingRule("new")}>
              <Plus className="h-4 w-4" />
              Thêm quy tắc
            </Button>
          ) : (
            <Button onClick={() => setEditingTemplate("new")}>
              <Plus className="h-4 w-4" />
              Thêm đầu việc
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("rules")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "rules" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Lịch lặp hằng tuần
        </button>
        <button
          type="button"
          onClick={() => setTab("templates")}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === "templates" ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Đầu việc mẫu
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Đang tải...</p>
      ) : tab === "rules" ? (
        rules.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Chưa có quy tắc lịch trực"
            description="Thêm quy tắc để tự động sinh lịch trực hằng tuần."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Thứ</th>
                  <th className="px-4 py-3">Người trực</th>
                  <th className="px-4 py-3">Hiệu lực từ</th>
                  <th className="px-4 py-3">Hiệu lực đến</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => {
                  const isExpired = Boolean(rule.endDate && rule.endDate < getAppDateKey());
                  return (
                  <tr key={rule.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {DUTY_WEEKDAY_OPTIONS.find((weekday) => weekday.value === rule.weekday)?.label}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AvatarStack
                          people={rule.assignees.map((assignee) => ({
                            name: assignee.name,
                            avatarColor: assignee.avatarColor,
                          }))}
                        />
                        <span className="text-gray-700">
                          {rule.assignees.map((assignee) => assignee.name).join(", ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateVN(rule.startDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{rule.endDate ? formatDateVN(rule.endDate) : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          isExpired
                            ? "bg-gray-100 text-gray-500"
                            : rule.active
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {isExpired ? "Hết hạn" : rule.active ? "Đang áp dụng" : "Tạm dừng"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingRule(rule)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                          aria-label="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                          aria-label="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Chưa có đầu việc mẫu"
          description="Thêm đầu việc để tự động áp dụng cho mỗi ca trực."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Tên đầu việc</th>
                <th className="px-4 py-3">Thứ tự</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{template.name}</p>
                    {template.description && <p className="text-xs text-gray-400">{template.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{template.order}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        template.active ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {template.active ? "Đang sử dụng" : "Tạm dừng"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingTemplate(template)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        aria-label="Sửa"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                        aria-label="Xóa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRule && (
        <DutyRuleFormModal
          rule={editingRule === "new" ? undefined : editingRule}
          members={members}
          onClose={() => setEditingRule(null)}
          onSave={handleSaveRule}
        />
      )}
      {editingTemplate && (
        <DutyTemplateFormModal
          template={editingTemplate === "new" ? undefined : editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSave={handleSaveTemplate}
        />
      )}
    </div>
  );
}
