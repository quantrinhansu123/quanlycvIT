import { Download } from "lucide-react";
import { googleDriveDownloadUrl } from "@/lib/drive-download";
import { cn } from "@/lib/utils";

interface FileDownloadButtonProps {
  url: string;
  name: string;
  className?: string;
}

export function FileDownloadButton({ url, name, className }: FileDownloadButtonProps) {
  return (
    <a
      href={googleDriveDownloadUrl(url)}
      download={name}
      target="_blank"
      rel="noreferrer"
      title="Tải tệp"
      aria-label={`Tải tệp ${name}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-brand-50 hover:text-brand-600",
        className
      )}
    >
      <Download className="h-3.5 w-3.5" />
    </a>
  );
}
