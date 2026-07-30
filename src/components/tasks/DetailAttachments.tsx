"use client";

import { useState } from "react";
import { ExternalLink, FileText, Images, Link2 } from "lucide-react";
import type { TaskFileAttachment, TaskLinkAttachment } from "@/types/task";
import {
  ImagePreviewDialog,
  type PreviewImage,
} from "@/components/ui/ImagePreviewDialog";

interface DetailAttachmentsProps {
  entityLabel: string;
  files: TaskFileAttachment[];
  links: TaskLinkAttachment[];
  images: string[];
}

export function DetailAttachments({
  entityLabel,
  files,
  links,
  images,
}: DetailAttachmentsProps) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  return (
    <>
      <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <Images className="h-3.5 w-3.5 text-blue-500" />
            Hình ảnh ({images.length})
          </p>
          {images.length > 0 ? (
            <ul className="flex max-w-full flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden pb-2">
              {images.map((url, index) => (
                <li key={url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewImage({
                        name: `Ảnh ${entityLabel} ${index + 1}`,
                        url,
                      })
                    }
                    className="group relative block h-20 w-28 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                    aria-label={`Xem trước ảnh ${entityLabel} ${index + 1}`}
                  >
                    {/* URL ảnh động nên dùng img thay vì giới hạn hostname của next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Ảnh ${entityLabel} ${index + 1}`}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-gray-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      {index + 1}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">_</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
              Tệp đính kèm ({files.length})
            </p>
            {files.length > 0 ? (
                <ul className="space-y-1.5">
                  {files.map((file) => (
                    <li key={file.url}>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-xs text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                      </a>
                    </li>
                  ))}
                </ul>
            ) : (
              <p className="text-sm text-gray-400">_</p>
            )}
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
              Liên kết ({links.length})
            </p>
            {links.length > 0 ? (
                <ul className="space-y-1.5">
                  {links.map((link, index) => (
                    <li key={`${link.url}-${index}`}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-xs text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1 truncate">
                          {link.label || link.url}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                      </a>
                      {link.description && (
                        <p className="mt-1 truncate px-2.5 text-[11px] text-gray-400">
                          {link.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
            ) : (
              <p className="text-sm text-gray-400">_</p>
            )}
          </div>
        </div>
      </div>

      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
}
