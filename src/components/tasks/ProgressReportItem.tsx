import { Link2, Paperclip } from "lucide-react";
import type { ProgressReport } from "@/types/task";
import { Avatar } from "@/components/ui/Avatar";
import { formatDateVN } from "@/lib/utils";

export function ProgressReportItem({ report }: { report: ProgressReport }) {
  const images = report.attachments.filter((item) => item.kind === "image");
  const files = report.attachments.filter((item) => item.kind === "file");

  return (
    <li className="rounded-xl border border-gray-200 px-4 py-3.5 text-sm text-gray-600">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {report.authorName && (
            <Avatar name={report.authorName} color={report.authorColor} size="sm" />
          )}
          <span className="text-xs font-semibold text-gray-700">
            {report.authorName ?? "Không xác định"}
          </span>
        </div>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
          {report.progress}%
        </span>
      </div>

      <p className="whitespace-pre-wrap">{report.content}</p>

      {images.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {images.map((image) => (
            <a key={image.id} href={image.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.fileName}
                className="h-20 w-full rounded-md border border-gray-200 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {file.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}

      {report.links.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {report.links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" />
                {link.label ?? link.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-xs text-gray-400">{formatDateVN(report.createdAt)}</p>
    </li>
  );
}
