import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";
import { beginApiObservation } from "@/lib/api/observability";

export const runtime = "nodejs";

/** Google Apps Script Web App giới hạn payload; giữ dư an toàn dưới ngưỡng đó. */
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 60_000;

function configuration() {
  const uploadUrl = process.env.GOOGLE_APPS_SCRIPT_UPLOAD_URL;
  const secret = process.env.GOOGLE_APPS_SCRIPT_UPLOAD_SECRET;

  if (!uploadUrl || !secret) {
    throw new ApiException("Google Drive chưa được cấu hình trên máy chủ.", 503);
  }

  return { uploadUrl, secret };
}

export async function POST(request: Request) {
  beginApiObservation(request);
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiException("Dữ liệu tải tệp không hợp lệ.", 400);
    }
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiException("Vui lòng chọn một tệp.");
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      throw new ApiException("Mỗi tệp đính kèm phải có dung lượng tối đa 20 MB.");
    }

    const { uploadUrl, secret } = configuration();
    const buffer = Buffer.from(await file.arrayBuffer());

    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64: buffer.toString("base64"),
        }),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (uploadError) {
      if (
        uploadError instanceof Error &&
        (uploadError.name === "TimeoutError" || uploadError.name === "AbortError")
      ) {
        throw new ApiException("Tải tệp lên Google Drive quá thời gian chờ. Vui lòng thử lại.", 504);
      }
      throw uploadError;
    }

    const payload = (await response.json().catch(() => null)) as
      | { url?: string; error?: string }
      | null;

    if (!response.ok || !payload?.url) {
      console.error(
        "Google Drive upload failed:",
        payload?.error ?? response.status
      );
      throw new ApiException("Không thể tải tệp lên Google Drive. Vui lòng thử lại.", 502);
    }

    return apiSuccess({ url: payload.url, name: file.name });
  } catch (error) {
    return handleApiError(error);
  }
}
