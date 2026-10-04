/**
 * Đổi link xem Google Drive thành link tải trực tiếp.
 * File đính kèm được Apps Script lưu trên Drive và trả về URL dạng xem.
 */
export function googleDriveDownloadUrl(fileUrl: string): string {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return fileUrl;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return fileUrl;

  const host = url.hostname.toLowerCase();
  const isDriveHost =
    host === "drive.google.com" ||
    host === "docs.google.com" ||
    host.endsWith(".googleusercontent.com");
  if (!isDriveHost) return fileUrl;

  const pathId = url.pathname.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/)?.[1];
  const id = pathId ?? url.searchParams.get("id");
  if (!id) return fileUrl;

  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}
