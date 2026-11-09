"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BookOpenText, ChevronRight, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchableFilterSelect } from "@/components/ui/SearchableFilterSelect";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { apiClient } from "@/services/api-client";
import { getErrorMessage } from "@/lib/errors";
import type { ProjectDirectoryItem } from "@/types/project";
import type { ProjectProcess, ProjectProcessInput, ProjectProcessStep } from "@/types/project-process";

const newStep = (): ProjectProcessStep => ({ id: crypto.randomUUID(), title: "", content: "", images: [] });

/** Ảnh đại diện danh sách: ưu tiên ảnh quy trình, sau đó ảnh bước đầu tiên. */
function thumbnailOf(process: ProjectProcess): string {
  return process.coverImageUrl || process.steps.find((step) => step.images.length > 0)?.images[0] || "";
}

export function ProjectProcessesClient({ initialProjects, initialProcesses, migrationReady, coverReady, canEdit }: {
  initialProjects: ProjectDirectoryItem[];
  initialProcesses: ProjectProcess[];
  migrationReady: boolean;
  coverReady: boolean;
  canEdit: boolean;
}) {
  const { confirm, notify } = useFeedback();
  const [projects, setProjects] = useState(initialProjects);
  const [processes, setProcesses] = useState(initialProcesses);
  const [ready, setReady] = useState(migrationReady);
  const [canSaveCover, setCanSaveCover] = useState(coverReady);
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectProcessInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [stepModal, setStepModal] = useState<{ process: ProjectProcess; step: ProjectProcessStep } | null>(null);
  const [stepSaving, setStepSaving] = useState(false);
  const [stepUploading, setStepUploading] = useState(false);
  const [stepError, setStepError] = useState("");
  const [error, setError] = useState("");

  const visible = useMemo(() => processes.filter((process) => {
    if (projectId && process.projectId !== projectId) return false;
    const term = search.trim().toLocaleLowerCase("vi");
    if (!term) return true;
    const project = projects.find((entry) => entry.id === process.projectId);
    return [project?.name, project?.code, process.title, process.summary,
      ...process.steps.flatMap((step) => [step.title, step.content])]
      .some((text) => text?.toLocaleLowerCase("vi").includes(term));
  }), [processes, projects, projectId, search]);
  const selected = visible.find((process) => process.id === selectedId) ?? visible[0];
  const selectedProject = selected ? projects.find((project) => project.id === selected.projectId) : undefined;

  function beginCreate() {
    setError("");
    setEditingId(null);
    setDraft({ projectId: projectId || projects[0]?.id || "", title: "", summary: "", coverImageUrl: "", steps: [newStep()] });
  }

  function beginEdit(process: ProjectProcess) {
    setError("");
    setEditingId(process.id);
    setDraft({ projectId: process.projectId, title: process.title, summary: process.summary, coverImageUrl: process.coverImageUrl,
      steps: process.steps.map((step) => ({ ...step, images: [...step.images] })) });
  }

  function openStepModal(process: ProjectProcess) {
    if (process.steps.length >= 30) {
      notify({ type: "error", title: "Quy trình tối đa 30 bước" });
      return;
    }
    setStepError("");
    setStepModal({ process, step: newStep() });
  }

  function updateModalStep(patch: Partial<ProjectProcessStep>) {
    setStepModal((current) => current ? { ...current, step: { ...current.step, ...patch } } : current);
  }

  async function uploadModalImages(files: File[]) {
    if (!stepModal || stepUploading || !files.length) return;
    if (stepModal.step.images.length + files.length > 5) { setStepError("Mỗi bước tối đa 5 ảnh."); return; }
    setStepUploading(true);
    setStepError("");
    try {
      for (const file of files) {
        if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
          throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, WEBP, AVIF tối đa 10 MB.");
        }
        const body = new FormData();
        body.set("file", file);
        const result = await apiClient.postFormData<{ url: string }>("/media/task-image", body);
        setStepModal((current) => current ? { ...current, step: { ...current.step, images: [...current.step.images, result.url] } } : current);
      }
    } catch (reason) {
      setStepError(getErrorMessage(reason, "Không thể tải ảnh. Ảnh đã tải thành công vẫn được giữ."));
    } finally {
      setStepUploading(false);
    }
  }

  async function saveNewStep() {
    if (!stepModal || stepSaving || stepUploading) return;
    const title = stepModal.step.title.trim();
    if (!title) { setStepError("Vui lòng nhập tiêu đề bước."); return; }
    setStepSaving(true);
    setStepError("");
    try {
      const process = stepModal.process;
      const input: ProjectProcessInput = {
        projectId: process.projectId,
        title: process.title,
        summary: process.summary,
        coverImageUrl: process.coverImageUrl,
        steps: [...process.steps, { ...stepModal.step, title }],
      };
      const saved = await apiClient.put<ProjectProcess>(`/project-processes/${process.id}`, input);
      setProcesses((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      setStepModal(null);
      notify({ type: "success", title: "Đã thêm bước" });
    } catch (reason) {
      setStepError(getErrorMessage(reason, "Không thể thêm bước."));
    } finally {
      setStepSaving(false);
    }
  }

  useEffect(() => {
    if (!stepModal) return;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !stepSaving) setStepModal(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
    };
  }, [stepModal, stepSaving]);

  function updateStep(id: string, patch: Partial<ProjectProcessStep>) {
    setDraft((current) => current ? { ...current, steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step) } : current);
  }

  async function uploadImages(stepId: string, files: File[]) {
    if (!draft || uploadingStep || !files.length) return;
    const step = draft.steps.find((entry) => entry.id === stepId);
    if (!step || step.images.length + files.length > 5) { setError("Mỗi bước tối đa 5 ảnh."); return; }
    setUploadingStep(stepId);
    setError("");
    try {
      for (const file of files) {
        if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
          throw new Error("Chỉ hỗ trợ ảnh PNG, JPG, WEBP, AVIF tối đa 10 MB.");
        }
        const body = new FormData();
        body.set("file", file);
        const result = await apiClient.postFormData<{ url: string }>("/media/task-image", body);
        setDraft((current) => current ? { ...current, steps: current.steps.map((entry) => entry.id === stepId ? {
          ...entry, images: [...entry.images, result.url],
        } : entry) } : current);
      }
    } catch (reason) {
      setError(getErrorMessage(reason, "Không thể tải ảnh. Ảnh đã tải thành công vẫn được giữ trong bản nháp."));
    } finally {
      setUploadingStep(null);
    }
  }

  async function uploadCover(file?: File) {
    if (!file || uploadingCover || !canSaveCover) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      setError("Chỉ hỗ trợ ảnh PNG, JPG, WEBP, AVIF tối đa 10 MB.");
      return;
    }
    setUploadingCover(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await apiClient.postFormData<{ url: string }>("/media/task-image", body);
      setDraft((current) => current ? { ...current, coverImageUrl: result.url } : current);
    } catch (reason) {
      setError(getErrorMessage(reason, "Không thể tải ảnh quy trình."));
    } finally {
      setUploadingCover(false);
    }
  }

  async function save() {
    if (!draft || saving || uploadingStep || uploadingCover) return;
    if (!draft.projectId || !draft.title.trim() || draft.steps.some((step) => !step.title.trim())) {
      setError("Chọn dự án và nhập tiêu đề quy trình, tiêu đề cho từng bước.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = editingId
        ? await apiClient.put<ProjectProcess>(`/project-processes/${editingId}`, draft)
        : await apiClient.post<ProjectProcess>("/project-processes", draft);
      setProcesses((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      setProjectId("");
      setSearch("");
      setDraft(null);
      notify({ type: "success", title: "Đã lưu quy trình" });
    } catch (reason) {
      setError(getErrorMessage(reason, "Không thể lưu quy trình."));
    } finally { setSaving(false); }
  }

  async function remove(process: ProjectProcess) {
    if (!await confirm({ title: "Xóa quy trình?", description: `Xóa “${process.title}” và các bước của quy trình này?`, confirmLabel: "Xóa", tone: "danger" })) return;
    try {
      await apiClient.delete(`/project-processes/${process.id}`);
      setProcesses((current) => current.filter((entry) => entry.id !== process.id));
      notify({ type: "success", title: "Đã xóa quy trình" });
    } catch (reason) { notify({ type: "error", title: "Không thể xóa quy trình", description: getErrorMessage(reason, "Vui lòng thử lại.") }); }
  }

  async function refresh() {
    try {
      const result = await apiClient.get<{ projects: ProjectDirectoryItem[]; processes: ProjectProcess[]; migrationReady: boolean; coverReady: boolean }>("/project-processes");
      setProjects(result.projects);
      setProcesses(result.processes);
      setReady(result.migrationReady);
      setCanSaveCover(result.coverReady);
    } catch (reason) { notify({ type: "error", title: "Không thể tải quy trình", description: getErrorMessage(reason, "Vui lòng thử lại.") }); }
  }

  return <div className="w-full space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BookOpenText className="h-6 w-6 text-brand-600" />Quy trình dự án</h1>
        <p className="mt-1 text-sm text-gray-500">Tra cứu hướng dẫn thực hiện theo từng bước, có nội dung và hình ảnh minh họa.</p></div>
      {canEdit && <Button type="button" disabled={!ready || projects.length === 0} onClick={beginCreate}><Plus className="h-4 w-4" />Thêm quy trình</Button>}
    </header>
    {!ready && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      Chưa thể lưu quy trình: cần áp dụng migration <code>20261106000200_project_processes.sql</code> lên Supabase. <button type="button" className="font-semibold underline" onClick={() => void refresh()}>Thử tải lại</button>
    </div>}
    {ready && !canSaveCover && canEdit && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      Để lưu ảnh của quy trình, cần áp dụng migration <code>20261106000300_project_process_cover_image.sql</code> lên Supabase. <button type="button" className="font-semibold underline" onClick={() => void refresh()}>Thử tải lại</button>
    </div>}
    <div className="flex flex-wrap gap-3">
      <label className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm dự án, quy trình hoặc nội dung bước..." aria-label="Tìm quy trình"
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500" /></label>
      <SearchableFilterSelect className="w-full sm:w-64" size="md" label="Tất cả dự án" searchPlaceholder="Gõ tên hoặc mã dự án..."
        value={projectId} onChange={setProjectId}
        options={[
          { value: "", label: "Tất cả dự án", sublabel: `${projects.length} dự án` },
          ...projects.map((project) => ({ value: project.id, label: project.name, sublabel: project.code })),
        ]} />
    </div>
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="max-h-[72vh] space-y-2 self-start overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 lg:sticky lg:top-4">
        <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{visible.length} quy trình</p>
        {visible.map((process) => {
          const active = selected?.id === process.id && !draft;
          const thumbnail = thumbnailOf(process);
          return <button type="button" key={process.id} onClick={() => { setSelectedId(process.id); setDraft(null); }}
            aria-current={active ? "true" : undefined}
            className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${active ? "border-brand-200 bg-brand-50 text-brand-700" : "border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50"}`}>
            <span className="relative flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
              {thumbnail
                ? <Image src={thumbnail} alt="" width={96} height={72} unoptimized className="h-full w-full object-cover" />
                : <BookOpenText className="h-5 w-5 text-gray-400" />}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{process.title}</strong>
              <span className="mt-1 block truncate text-xs text-gray-500">{projects.find((project) => project.id === process.projectId)?.name ?? "Dự án"}</span>
              <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{process.steps.length} bước</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          </button>;
        })}
        {!visible.length && <p className="px-3 py-8 text-center text-sm text-gray-400">Không có quy trình phù hợp.</p>}
      </aside>
      <main className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        {draft ? <div className="space-y-5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{editingId ? "Chỉnh sửa quy trình" : "Thêm quy trình"}</h2>
            <button type="button" onClick={() => setDraft(null)} aria-label="Đóng form"><X className="h-5 w-5 text-gray-500" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="text-sm font-semibold">Dự án *
              <SearchableFilterSelect className="mt-1 w-full" menuClassName="w-full" size="md" label="Chọn dự án" searchPlaceholder="Gõ tên hoặc mã dự án..."
                value={draft.projectId} onChange={(value) => setDraft((current) => current ? { ...current, projectId: value } : current)}
                options={projects.map((project) => ({ value: project.id, label: project.name, sublabel: project.code }))} />
            </div>
            <label className="block text-sm font-semibold">Tiêu đề quy trình *<input value={draft.title} maxLength={200} onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Ví dụ: Quy trình bàn giao dự án" className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 font-normal" /></label>
          </div>
          <label className="block text-sm font-semibold">Mô tả ngắn<textarea value={draft.summary} maxLength={2000} onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            rows={2} className="mt-1 block w-full rounded-lg border border-gray-200 p-3 font-normal" /></label>
          <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Ảnh của quy trình</h3>
              <p className="mt-0.5 text-xs text-gray-500">Ảnh minh họa chung, hiển thị cạnh tiêu đề quy trình.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
              <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
                {draft.coverImageUrl ? <>
                  <Image src={draft.coverImageUrl} alt="Ảnh minh họa quy trình" width={800} height={500} unoptimized className="h-full w-full object-contain p-1.5" />
                  <button type="button" onClick={() => setDraft((current) => current ? { ...current, coverImageUrl: "" } : current)}
                    aria-label="Xóa ảnh quy trình" className="absolute right-1.5 top-1.5 rounded bg-white/90 p-1 text-rose-600 shadow"><X className="h-4 w-4" /></button>
                </> : <span className="flex flex-col items-center gap-1 text-xs text-gray-400"><ImagePlus className="h-6 w-6" />Chưa có ảnh</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                  <ImagePlus className="h-4 w-4" />{uploadingCover ? "Đang tải ảnh..." : "Chọn ảnh"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={uploadingCover || !canSaveCover} className="sr-only"
                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadCover(file); }} />
                </label>
                <div tabIndex={canSaveCover ? 0 : -1} role="textbox" aria-label="Dán ảnh quy trình" onPaste={(event) => {
                  const file = Array.from(event.clipboardData.items).map((item) => item.kind === "file" ? item.getAsFile() : null)
                    .find((entry) => entry?.type.startsWith("image/"));
                  if (file) { event.preventDefault(); void uploadCover(file); }
                }} className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500">Bấm vào đây, Ctrl+V để dán ảnh</div>
              </div>
            </div>
          </section>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-bold">Các bước thực hiện</h3>
              <Button type="button" size="sm" variant="secondary" disabled={draft.steps.length >= 30} onClick={() => setDraft({ ...draft, steps: [...draft.steps, newStep()] })}><Plus className="h-4 w-4" />Thêm bước</Button></div>
            {draft.steps.map((step, index) => <section key={step.id} className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between"><strong className="text-brand-700">Bước {index + 1}</strong>
                <button type="button" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((entry) => entry.id !== step.id) })} aria-label={`Xóa bước ${index + 1}`} className="text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
              <label className="block text-xs font-semibold text-gray-600">Tiêu đề *<input value={step.title} maxLength={200} onChange={(event) => updateStep(step.id, { title: event.target.value })}
                placeholder="Tên bước cần thực hiện" className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-900" /></label>
              <label className="block text-xs font-semibold text-gray-600">Nội dung<textarea value={step.content} maxLength={10000} onChange={(event) => updateStep(step.id, { content: event.target.value })}
                rows={4} placeholder="Mô tả cụ thể cách thực hiện bước này..." className="mt-1 block w-full rounded-lg border border-gray-200 p-3 text-sm font-normal text-gray-800" /></label>
              <div className="grid gap-2 sm:grid-cols-3">{step.images.map((url, imageIndex) => <div key={`${url}-${imageIndex}`} className="relative aspect-[16/10] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <Image src={url} alt={`Ảnh bước ${index + 1} số ${imageIndex + 1}`} width={500} height={320} unoptimized className="h-full w-full object-contain p-1.5" />
                <button type="button" onClick={() => updateStep(step.id, { images: step.images.filter((_, i) => i !== imageIndex) })}
                  aria-label={`Xóa ảnh ${imageIndex + 1} của bước ${index + 1}`} className="absolute right-1.5 top-1.5 rounded bg-white/90 p-1 text-rose-600 shadow"><X className="h-4 w-4" /></button>
              </div>)}</div>
              <div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium hover:bg-gray-50">
                <ImagePlus className="h-4 w-4" />{uploadingStep === step.id ? "Đang tải ảnh..." : "Chọn ảnh"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple disabled={Boolean(uploadingStep) || step.images.length >= 5} className="sr-only"
                  onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadImages(step.id, files); }} /></label>
                <div tabIndex={0} role="textbox" aria-label={`Dán ảnh cho bước ${index + 1}`} onPaste={(event) => {
                  const files = Array.from(event.clipboardData.items).filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                    .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
                  if (files.length) { event.preventDefault(); void uploadImages(step.id, files); }
                }} className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">Bấm vào đây, Ctrl+V để dán ảnh</div>
              </div>
            </section>)}
          </div>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDraft(null)}>Hủy</Button>
            <Button type="button" disabled={saving || Boolean(uploadingStep) || uploadingCover} onClick={() => void save()}>{saving ? "Đang lưu..." : "Lưu quy trình"}</Button></div>
        </div> : selected ? <article className="space-y-5">
          <header className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className={selected.coverImageUrl ? "grid md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]" : "grid"}>
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{selectedProject?.name ?? "Dự án"}</p>
                    <h2 className="mt-1 break-words text-2xl font-bold text-gray-900">{selected.title}</h2>
                  </div>
                  {canEdit && <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => openStepModal(selected)}><Plus className="h-4 w-4" />Thêm bước</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => beginEdit(selected)}><Pencil className="h-4 w-4" />Sửa</Button>
                    <Button type="button" size="sm" variant="danger" onClick={() => void remove(selected)}><Trash2 className="h-4 w-4" />Xóa</Button>
                  </div>}
                </div>
                {selected.summary && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">{selected.summary}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-xs text-gray-500">
                  <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">{selected.steps.length} bước</span>
                  <span>Cập nhật {new Date(selected.updatedAt).toLocaleDateString("vi-VN")}</span>
                </div>
              </div>
              {selected.coverImageUrl && <a href={selected.coverImageUrl} target="_blank" rel="noreferrer"
                className="block border-t border-gray-200 bg-gray-50 md:border-l md:border-t-0" title="Mở ảnh quy trình">
                <Image src={selected.coverImageUrl} alt={`Ảnh quy trình ${selected.title}`} width={800} height={600} unoptimized
                  className="h-full max-h-64 w-full object-contain p-3 md:max-h-none" />
              </a>}
            </div>
          </header>
          <ol className="space-y-3">
            {selected.steps.map((step, index) => <li key={step.id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
              <div className={`grid gap-4 sm:gap-5 ${step.images.length > 0 ? "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
                {step.images.length > 0 && <div className={`grid gap-2 self-start ${step.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {step.images.map((url, i) => <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    <Image src={url} alt={`${step.title} - ảnh ${i + 1}`} width={800} height={500} unoptimized
                      className="aspect-[16/10] w-full object-contain p-1.5" />
                  </a>)}
                </div>}
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{index + 1}</span>
                    <h3 className="break-words pt-0.5 text-xl font-bold text-gray-900 sm:text-2xl">{step.title}</h3>
                  </div>
                  {step.content && <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-gray-700 sm:text-[17px] sm:leading-8">{step.content}</p>}
                </div>
              </div>
            </li>)}
          </ol>
          {!selected.steps.length && <p className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-400">Quy trình chưa có bước nào.</p>}
          {canEdit && <button type="button" onClick={() => openStepModal(selected)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-500 transition hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700">
            <Plus className="h-4 w-4" />Thêm bước
          </button>}
        </article> : <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-sm text-gray-500">
          <BookOpenText className="h-10 w-10 text-gray-300" />
          Chọn một quy trình để xem các bước hoặc tạo quy trình mới.
        </div>}
      </main>
    </div>
    {stepModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && !stepSaving && setStepModal(null)}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-step-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="add-step-title" className="text-lg font-bold text-gray-900">Thêm bước</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{stepModal.process.title}</p>
          </div>
          <button type="button" onClick={() => setStepModal(null)} disabled={stepSaving} aria-label="Đóng"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block text-sm font-semibold">Tiêu đề bước *
            <input autoFocus value={stepModal.step.title} maxLength={200} onChange={(event) => updateModalStep({ title: event.target.value })}
              placeholder="Tên bước cần thực hiện" className="mt-1 block h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-900 outline-none focus:border-brand-500" />
          </label>
          <label className="block text-sm font-semibold">Nội dung
            <textarea rows={5} value={stepModal.step.content} maxLength={10000} onChange={(event) => updateModalStep({ content: event.target.value })}
              placeholder="Mô tả cụ thể cách thực hiện bước này..." className="mt-1 block w-full rounded-lg border border-gray-200 p-3 text-sm font-normal text-gray-800 outline-none focus:border-brand-500" />
          </label>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Ảnh minh họa <span className="font-normal text-gray-400">(tối đa 5 ảnh)</span></h3>
            {stepModal.step.images.length > 0 && <div className="grid gap-2 sm:grid-cols-3">{stepModal.step.images.map((url, index) => <div key={`${url}-${index}`} className="relative aspect-[16/10] overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              <Image src={url} alt={`Ảnh bước mới số ${index + 1}`} width={500} height={320} unoptimized className="h-full w-full object-contain p-1.5" />
              <button type="button" onClick={() => updateModalStep({ images: stepModal.step.images.filter((_, i) => i !== index) })}
                aria-label={`Xóa ảnh ${index + 1}`} className="absolute right-1.5 top-1.5 rounded bg-white/90 p-1 text-rose-600 shadow"><X className="h-4 w-4" /></button>
            </div>)}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                <ImagePlus className="h-4 w-4" />{stepUploading ? "Đang tải ảnh..." : "Chọn ảnh"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" multiple disabled={stepUploading || stepModal.step.images.length >= 5} className="sr-only"
                  onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadModalImages(files); }} />
              </label>
              <div tabIndex={0} role="textbox" aria-label="Dán ảnh cho bước mới" onPaste={(event) => {
                const files = Array.from(event.clipboardData.items).filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                  .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
                if (files.length) { event.preventDefault(); void uploadModalImages(files); }
              }} className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">Bấm vào đây, Ctrl+V để dán ảnh</div>
            </div>
          </section>
          {stepError && <p role="alert" className="text-sm text-rose-600">{stepError}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <Button type="button" variant="secondary" disabled={stepSaving} onClick={() => setStepModal(null)}>Hủy</Button>
          <Button type="button" disabled={stepSaving || stepUploading} onClick={() => void saveNewStep()}>{stepSaving ? "Đang lưu..." : "Lưu bước"}</Button>
        </footer>
      </div>
    </div>}
  </div>;
}
