import { createHash, randomUUID } from "node:crypto";
import { ApiException } from "@/lib/api/response";

const REPORT_FOLDER = "quan-ly-nhan-su/reports/";

function configuration() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new ApiException("Cloudinary chưa được cấu hình trên máy chủ.", 503);
  }
  return { cloudName, apiKey, apiSecret };
}

function signedForm(parameters: Record<string, string>, apiKey: string, apiSecret: string) {
  const values = { ...parameters, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signature = createHash("sha1")
    .update(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&") + apiSecret)
    .digest("hex");
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  form.set("api_key", apiKey);
  form.set("signature", signature);
  return form;
}

export async function uploadReportFile(taskId: string, file: File): Promise<string> {
  const { cloudName, apiKey, apiSecret } = configuration();
  const resourceType = ["image/jpeg", "image/png", "image/webp"].includes(file.type) ? "image" : "raw";
  const extension = resourceType === "raw" ? file.name.match(/\.[a-z0-9]{1,20}$/i)?.[0].toLowerCase() ?? "" : "";
  const publicId = `${REPORT_FOLDER}${taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}/${randomUUID()}${extension}`;
  const form = signedForm({ public_id: publicId }, apiKey, apiSecret);
  form.set("file", file);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json() as { secure_url?: string; public_id?: string };
  if (!response.ok || !payload.secure_url || payload.public_id !== publicId) {
    throw new ApiException(`Không thể tải file “${file.name}” lên Cloudinary. Vui lòng thử lại.`, 502);
  }
  return payload.secure_url;
}

/** Only delete assets in our report folder and the currently configured cloud. */
export async function removeReportFile(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return;
  const match = parsed.pathname.match(/^\/([^/]+)\/(image|raw)\/upload\/v\d+\/(.+)$/);
  if (!match || match[1] !== process.env.CLOUDINARY_CLOUD_NAME) return;
  const resourceType = match[2];
  const path = decodeURIComponent(match[3]);
  if (!path.startsWith(REPORT_FOLDER)) return;
  const publicId = resourceType === "image" ? path.replace(/\.[^/.]+$/, "") : path;
  const { cloudName, apiKey, apiSecret } = configuration();
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body: signedForm({ public_id: publicId, invalidate: "true" }, apiKey, apiSecret),
  });
  const payload = await response.json() as { result?: string };
  if (!response.ok || !["ok", "not found"].includes(payload.result ?? "")) {
    throw new ApiException("Không thể xóa tệp báo cáo trên Cloudinary.", 502);
  }
}
