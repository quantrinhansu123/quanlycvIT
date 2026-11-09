import { ApiException } from "@/lib/api/response";
import type { ApiSupabaseClient } from "@/lib/supabase/api";
import type { ProjectProcess, ProjectProcessInput, ProjectProcessStep } from "@/types/project-process";

const LEGACY_SELECT = "id,du_an_id,tieu_de,mo_ta,cac_buoc,updated_at";
const SELECT = "id,du_an_id,tieu_de,mo_ta,cac_buoc,updated_at,anh_dai_dien";
const missingCoverColumn = (code?: string) => code === "42703" || code === "PGRST204";

function mapProcess(row: Record<string, unknown>): ProjectProcess {
  return {
    id: row.id as string,
    projectId: row.du_an_id as string,
    title: row.tieu_de as string,
    summary: (row.mo_ta as string | null) ?? "",
    coverImageUrl: typeof row.anh_dai_dien === "string" ? row.anh_dai_dien : "",
    steps: Array.isArray(row.cac_buoc) ? row.cac_buoc as ProjectProcessStep[] : [],
    updatedAt: row.updated_at as string,
  };
}

export function parseProjectProcess(value: Record<string, unknown>): ProjectProcessInput {
  const projectId = typeof value.projectId === "string" ? value.projectId.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const coverImageUrl = typeof value.coverImageUrl === "string" ? value.coverImageUrl.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(projectId) || !title || title.length > 200 || summary.length > 2000) {
    throw new ApiException("Dự án, tiêu đề hoặc mô tả quy trình không hợp lệ.", 400);
  }
  if (coverImageUrl && (!/^https:\/\//i.test(coverImageUrl) || coverImageUrl.length > 2048)) {
    throw new ApiException("Ảnh quy trình phải là link HTTPS hợp lệ.", 400);
  }
  if (!Array.isArray(value.steps) || value.steps.length > 30) throw new ApiException("Quy trình tối đa 30 bước.", 400);
  const steps = value.steps.map((raw): ProjectProcessStep => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiException("Bước quy trình không hợp lệ.", 400);
    const step = raw as Record<string, unknown>;
    const stepTitle = typeof step.title === "string" ? step.title.trim() : "";
    const content = typeof step.content === "string" ? step.content.trim() : "";
    if (!stepTitle || stepTitle.length > 200 || content.length > 10000 || !Array.isArray(step.images) || step.images.length > 5 ||
      !step.images.every((url) => typeof url === "string" && /^https:\/\//i.test(url) && url.length <= 2048)) {
      throw new ApiException("Mỗi bước cần tiêu đề; ảnh phải là link HTTPS (tối đa 5 ảnh/bước).", 400);
    }
    return { id: typeof step.id === "string" && /^[\w-]{1,80}$/.test(step.id) ? step.id : crypto.randomUUID(), title: stepTitle, content, images: step.images as string[] };
  });
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new ApiException("Các bước bị trùng mã.", 400);
  return { projectId, title, summary, coverImageUrl, steps };
}

export async function listProjectProcesses(supabase: ApiSupabaseClient, projectIds: string[]) {
  if (!projectIds.length) return { processes: [] as ProjectProcess[], migrationReady: true, coverReady: true };
  const { data, error } = await supabase.from("quy_trinh_du_an").select(SELECT)
    .in("du_an_id", projectIds).order("updated_at", { ascending: false });
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return { processes: [] as ProjectProcess[], migrationReady: false, coverReady: false };
  }
  if (missingCoverColumn(error?.code)) {
    const legacy = await supabase.from("quy_trinh_du_an").select(LEGACY_SELECT)
      .in("du_an_id", projectIds).order("updated_at", { ascending: false });
    if (legacy.error) throw legacy.error;
    return { processes: (legacy.data ?? []).map((row) => mapProcess(row)), migrationReady: true, coverReady: false };
  }
  if (error) throw error;
  return { processes: (data ?? []).map((row) => mapProcess(row)), migrationReady: true, coverReady: true };
}

export async function saveProjectProcess(supabase: ApiSupabaseClient, input: ProjectProcessInput, id?: string) {
  const payload = { du_an_id: input.projectId, tieu_de: input.title, mo_ta: input.summary, cac_buoc: input.steps, anh_dai_dien: input.coverImageUrl };
  const save = (withCover: boolean) => {
    const values = withCover ? payload : { du_an_id: payload.du_an_id, tieu_de: payload.tieu_de, mo_ta: payload.mo_ta, cac_buoc: payload.cac_buoc };
    const query = id
      ? supabase.from("quy_trinh_du_an").update(values).eq("id", id)
      : supabase.from("quy_trinh_du_an").insert(values);
    return query.select(withCover ? SELECT : LEGACY_SELECT).maybeSingle();
  };
  let { data, error } = await save(true);
  if (missingCoverColumn(error?.code)) {
    if (input.coverImageUrl) throw new ApiException("Cần áp dụng migration ảnh quy trình lên Supabase.", 503);
    const legacy = await save(false);
    data = legacy.data;
    error = legacy.error;
  }
  if (error?.code === "42P01" || error?.code === "PGRST205") throw new ApiException("Cần áp dụng migration quy trình dự án lên Supabase.", 503);
  if (error) throw error;
  if (!data) throw new ApiException("Không tìm thấy quy trình.", 404);
  return mapProcess(data as unknown as Record<string, unknown>);
}
