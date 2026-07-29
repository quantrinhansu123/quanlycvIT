import {
  ApiException,
  apiSuccess,
  handleApiError,
} from "@/lib/api/response";
import { parseTaskReportFields } from "@/lib/api/validation";
import { createApiSupabaseClient } from "@/lib/supabase/api";
import {
  createSubtaskReport,
  listSubtaskReports,
  uploadTaskReportFile,
  type TaskReportAttachmentInput,
} from "@/lib/supabase/data";
import {
  TASK_REPORT_IMAGE_MIME_TYPES,
  TASK_REPORT_MAX_FILE_SIZE,
} from "@/types/task";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const reports = await listSubtaskReports(createApiSupabaseClient(request), id);
    return apiSuccess(reports);
  } catch (error) {
    return handleApiError(error);
  }
}

function assertFileValid(file: File, expectImage: boolean): void {
  if (file.size === 0) {
    throw new ApiException(`File “${file.name}” rỗng.`, 400);
  }
  if (file.size > TASK_REPORT_MAX_FILE_SIZE) {
    throw new ApiException(`File “${file.name}” vượt quá 10MB.`, 400);
  }
  if (expectImage && !TASK_REPORT_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new ApiException(
      `Ảnh tiến độ “${file.name}” phải có định dạng PNG, JPG hoặc WEBP.`,
      400
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiException(
        "Nội dung yêu cầu phải là multipart/form-data.",
        400
      );
    }

    const fields = parseTaskReportFields({
      content: formData.get("content"),
      progress: formData.get("progress"),
      authorId: formData.get("authorId"),
      links: formData.get("links"),
    });
    const images = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File);
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    for (const image of images) assertFileValid(image, true);
    for (const file of files) assertFileValid(file, false);

    const supabase = createApiSupabaseClient(request);
    const attachments: TaskReportAttachmentInput[] = await Promise.all([
      ...images.map(async (file) => ({
        kind: "image" as const,
        fileName: file.name,
        path: await uploadTaskReportFile(supabase, id, file),
        mimeType: file.type || undefined,
        size: file.size,
      })),
      ...files.map(async (file) => ({
        kind: "file" as const,
        fileName: file.name,
        path: await uploadTaskReportFile(supabase, id, file),
        mimeType: file.type || undefined,
        size: file.size,
      })),
    ]);

    const report = await createSubtaskReport(supabase, id, {
      ...fields,
      attachments,
    });
    return apiSuccess(report, 201, "Gửi báo cáo tiến độ task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
