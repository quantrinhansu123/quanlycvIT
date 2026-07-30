import { createHash } from "node:crypto";
import { ApiException, apiSuccess, handleApiError } from "@/lib/api/response";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const TASK_IMAGE_FOLDER = "quan-ly-nhan-su/task-images";

function configuration() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new ApiException("Cloudinary chưa được cấu hình trên máy chủ.", 503);
  }

  return { cloudName, apiKey, apiSecret };
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiException("Dữ liệu tải ảnh không hợp lệ.", 400);
    }
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiException("Vui lòng chọn một tệp ảnh.");
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new ApiException("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc AVIF.");
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      throw new ApiException("Mỗi ảnh Task phải có dung lượng tối đa 10 MB.");
    }

    const { cloudName, apiKey, apiSecret } = configuration();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha1")
      .update(`folder=${TASK_IMAGE_FOLDER}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("api_key", apiKey);
    uploadForm.append("timestamp", String(timestamp));
    uploadForm.append("folder", TASK_IMAGE_FOLDER);
    uploadForm.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: uploadForm }
    );
    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      console.error(
        "Cloudinary task image upload failed:",
        payload.error?.message ?? response.status
      );
      throw new ApiException("Không thể tải ảnh Task lên Cloudinary. Vui lòng thử lại.", 502);
    }

    return apiSuccess({
      url: payload.secure_url.replace(
        "/image/upload/",
        "/image/upload/f_auto,q_auto/"
      ),
      publicId: payload.public_id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
