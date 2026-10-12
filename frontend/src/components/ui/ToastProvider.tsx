import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ToastApi, ToastContext, type ToastTone } from "../../hooks/toastContext";
import { createId } from "../../services/localStore";

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

const DISMISS_AFTER_MS = 6000;

const ICONS = {
  success: <CircleCheck className="size-4 text-success" aria-hidden="true" />,
  error: <CircleAlert className="size-4 text-danger" aria-hidden="true" />,
  info: <Info className="size-4 text-accent" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<ToastApi["notify"]>(
    (tone, message) => {
      const id = createId();
      setToasts((list) => [...list.slice(-3), { id, tone, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => window.clearTimeout(timer));
      active.clear();
    };
  }, []);

  const value = useMemo<ToastApi>(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full animate-fade-in items-start gap-3 rounded-xl border border-line-strong bg-overlay px-4 py-3 text-sm shadow-panel"
          >
            <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
            <p className="min-w-0 flex-1 break-words">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="-m-1 rounded-md p-1 text-subtle transition hover:text-fg"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
