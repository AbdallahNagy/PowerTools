import { useCallback, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import { ToastContext, type Toast, type ToastType } from "./ToastContext";
import { cn } from "./cn";

const toastStyles: Record<ToastType, { bar: string; icon: string; Icon: LucideIcon }> = {
  error: { bar: "border-l-danger", icon: "text-danger", Icon: CircleAlert },
  success: { bar: "border-l-ok", icon: "text-ok", Icon: CircleCheck },
  info: { bar: "border-l-accent-text", icon: "text-accent-text", Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-8 right-4 flex flex-col gap-2 z-50 max-w-sm w-full">
        {toasts.map((t) => {
          const { bar, icon, Icon } = toastStyles[t.type];
          return (
            <div
              key={t.id}
              data-toast-type={t.type}
              role={t.type === "error" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2.5 p-3 rounded-sm text-sm shadow-lg",
                "bg-raised text-fg border border-line border-l-4",
                bar,
              )}
            >
              <Icon size={16} className={cn("shrink-0 mt-0.5", icon)} aria-hidden="true" />
              <span className="flex-1 break-words">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-sm text-fg-muted hover:text-fg-strong mt-0.5"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
