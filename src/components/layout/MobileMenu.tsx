"use client";

import { X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 h-full w-[280px] shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-11 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-700"
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
        <Sidebar collapsed={false} />
      </div>
    </div>
  );
}
