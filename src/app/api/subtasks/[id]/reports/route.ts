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
  removeTaskReportFiles,
  uploadTaskReportFile,
  type TaskReportAttachmentInput,
} from "@/lib/supabase/data";
import {
  TASK_REPORT_IMAGE_MIME_TYPES,
  TASK_REPORT_MAX_FILE_SIZE,
} from "@/types/task";
import { runUploadBatch } from "@/lib/upload-concurrency";
import { requireRequestAccount } from "@/lib/supabase/authorization";

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
      testerId: formData.get("testerId"),
    });
    const images = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File);
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);
    if (images.length > 10 || files.length > 10) {
      throw new ApiException("Mỗi báo cáo chỉ được đính kèm tối đa 10 ảnh và 10 tệp.", 400);
    }
    for (const image of images) assertFileValid(image, true);
    for (const file of files) assertFileValid(file, false);

    const supabase = createApiSupabaseClient(request);
    const access = await requireRequestAccount(supabase);
    if (access.role === "member") {
      const { data: assignment, error: assignmentError } = await supabase
        .from("task_phu_trach")
        .select("task_id")
        .eq("task_id", id)
        .eq("tai_khoan_id", access.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) throw new ApiException("Bạn không phải người thực hiện Task này.", 403);
    }
    const attachments: TaskReportAttachmentInput[] = [];
    const uploadResult = await runUploadBatch([
      ...images.map((file, index) => ({
        id: `image:${index}`,
        upload: async () => {
          attachments.push({
            kind: "image",
            fileName: file.name,
            path: await uploadTaskReportFile(supabase, id, file),
            mimeType: file.type || undefined,
            size: file.size,
          });
        },
      })),
      ...files.map((file, index) => ({
        id: `file:${index}`,
        upload: async () => {
          attachments.push({
            kind: "file",
            fileName: file.name,
            path: await uploadTaskReportFile(supabase, id, file),
            mimeType: file.type || undefined,
            size: file.size,
          });
        },
      })),
    ]);
    if (uploadResult.failures.length) {
      try {
        await removeTaskReportFiles(supabase, attachments.map((attachment) => attachment.path));
      } catch (cleanupError) {
        console.error("Cannot clean up partial task report uploads:", cleanupError);
      }
      throw uploadResult.failures[0].reason;
    }

    let report;
    try {
      report = await createSubtaskReport(supabase, id, {
        ...fields,
        attachments,
      });
    } catch (createError) {
      try {
        await removeTaskReportFiles(supabase, attachments.map((attachment) => attachment.path));
      } catch (cleanupError) {
        console.error("Cannot clean up task report uploads after save failure:", cleanupError);
      }
      throw createError;
    }
    return apiSuccess(report, 201, "Gửi báo cáo tiến độ task thành công.");
  } catch (error) {
    return handleApiError(error);
  }
}
