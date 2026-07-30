"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export interface PreviewImage {
  name: string;
  url: string;
}

interface ImagePreviewDialogProps {
  image: PreviewImage | null;
  onClose: () => void;
}

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  useEffect(() => {
    if (!image) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/75 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Xem trước ảnh ${image.name}`}
        className="relative flex max-h-[92vh] max-w-[96vw] items-center justify-center"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gray-950/75 text-white shadow-lg transition hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950 sm:right-4 sm:top-4 sm:h-11 sm:w-11"
          aria-label="Đóng xem trước ảnh"
        >
          <X className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.name}
          className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}
