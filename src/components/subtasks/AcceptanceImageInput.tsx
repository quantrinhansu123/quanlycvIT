"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ClipboardPaste, ImagePlus, Save, X } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export function AcceptanceImageInput({ imageUrl, disabled, uploading, onUpload }: {
  imageUrl: string;
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pasteTarget = useRef<HTMLTextAreaElement>(null);
  const busy = disabled || uploading || saving;
  useEffect(() => {
    if (!pending) return;
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  function select(file: File) {
    if (busy) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      setError("Chọn ảnh PNG, JPG, WEBP hoặc AVIF, tối đa 10 MB.");
      return;
    }
    setError("");
    setPending(file);
  }

  async function readClipboard() {
    pasteTarget.current?.focus();
    try {
      if (!navigator.clipboard?.read) throw new Error();
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        select(new File([blob], `nghiem-thu-${Date.now()}.${type.split("/")[1]}`, { type }));
        return;
      }
      setError("Clipboard chưa có ảnh. Hãy sao chép ảnh hoặc chụp màn hình rồi Ctrl+V vào ô bên dưới.");
    } catch {
      setError("Hãy nhấn Ctrl+V vào ô dán ảnh bên dưới.");
    }
  }

  async function save() {
    if (!pending || busy) return;
    setSaving(true);
    setError("");
    try {
      await onUpload(pending);
      setPending(null);
      setPreview("");
    } catch (saveError) {
      setError(`${getErrorMessage(saveError, "Chưa lưu được ảnh.")} Ảnh vẫn được giữ để thử lại.`);
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-3 rounded-lg bg-gray-50 p-3">
    {(pending ? preview : /^https?:\/\//i.test(imageUrl) ? imageUrl : "") && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={pending ? preview : imageUrl} alt={pending ? "Ảnh nghiệm thu chưa lưu" : "Ảnh nghiệm thu đã lưu"} className="max-h-48 w-full rounded-lg border border-gray-200 bg-white p-1 object-contain" />
    )}
    <div className="flex flex-wrap items-center gap-2">
      <label className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 focus-within:ring-2 focus-within:ring-violet-300 ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-100"}`}>
        <ImagePlus className="h-3.5 w-3.5" />Chọn ảnh
        <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} className="sr-only" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) select(file);
          event.target.value = "";
        }} />
      </label>
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void readClipboard()}><ClipboardPaste className="h-3.5 w-3.5" />Dán ảnh</Button>
      {pending && <>
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}><Save className="h-3.5 w-3.5" />{saving || uploading ? "Đang lưu..." : "Lưu ảnh"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setPending(null); setPreview(""); setError(""); }}><X className="h-3.5 w-3.5" />Hủy</Button>
      </>}
    </div>
    <textarea ref={pasteTarget} rows={2} value="" disabled={busy} onChange={() => {}} aria-label="Dán ảnh nghiệm thu bằng Ctrl+V"
      placeholder="Bấm vào vùng này và nhấn Ctrl+V để dán ảnh"
      className="block min-h-16 w-full resize-none rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-xs leading-5 text-gray-600 outline-none placeholder:text-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
      onPaste={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = Array.from(event.clipboardData.items).map((item) => item.kind === "file" ? item.getAsFile() : null).find((item) => item?.type.startsWith("image/"))
          ?? Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
        if (file) select(file);
        else setError("Chưa nhận được ảnh. Hãy dùng Sao chép hình ảnh hoặc chụp màn hình, thay vì sao chép đường dẫn.");
      }} />
    <p role="status" className={`text-xs leading-5 ${error ? "text-rose-600" : pending ? "text-amber-700" : imageUrl ? "text-emerald-700" : "text-gray-400"}`}>
      {error || (pending ? "Ảnh mới chưa lưu. Bấm Lưu ảnh để xác nhận." : imageUrl ? "✓ Ảnh đã lưu" : "PNG, JPG, WEBP, AVIF · Tối đa 10 MB")}
    </p>
  </div>;
}
