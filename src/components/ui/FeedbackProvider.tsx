"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface ToastInput {
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface FeedbackContextValue {
  notify: (input: ToastInput) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, string> = {
  success: "border-emerald-200 bg-white text-emerald-600",
  error: "border-rose-200 bg-white text-rose-600",
  info: "border-blue-200 bg-white text-blue-600",
};

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id = ++toastId.current;
      const item: ToastItem = { ...input, id, type: input.type ?? "info" };
      setToasts((current) => [...current.slice(-3), item]);

      window.setTimeout(() => dismissToast(id), input.duration ?? 4500);
    },
    [dismissToast]
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm((current) => {
        current?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const closeConfirm = useCallback((confirmed: boolean) => {
    setPendingConfirm((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingConfirm) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeConfirm(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeConfirm, pendingConfirm]);

  const value = useMemo(() => ({ notify, confirm }), [confirm, notify]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg",
                TOAST_STYLES[toast.type]
              )}
              role={toast.type === "error" ? "alert" : "status"}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-xs leading-5 text-gray-600">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Đóng thông báo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirm(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 id="confirm-title" className="text-base font-bold text-gray-900">
                  {pendingConfirm.title}
                </h2>
                <p id="confirm-description" className="mt-2 text-sm leading-6 text-gray-600">
                  {pendingConfirm.description}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => closeConfirm(false)} autoFocus>
                {pendingConfirm.cancelLabel ?? "Hủy"}
              </Button>
              <Button
                variant={pendingConfirm.tone === "primary" ? "primary" : "danger"}
                onClick={() => closeConfirm(true)}
              >
                {pendingConfirm.confirmLabel ?? "Xác nhận"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback phải được sử dụng bên trong FeedbackProvider.");
  }
  return context;
}
