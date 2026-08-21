import { useCallback, useRef, useState, type ReactNode } from "react";
import { ToastContext, type Toast, type ToastType } from "./ToastContext";

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

  const colors: Record<ToastType, string> = {
    error: "bg-[#3c1e1e] border-red-700 text-red-200",
    success: "bg-[#1e3c1e] border-green-700 text-green-200",
    info: "bg-[#1e2d3c] border-[#007fd4] text-[#cccccc]",
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-8 right-4 flex flex-col gap-2 z-50 max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 p-3 rounded-sm border text-sm shadow-lg ${colors[t.type]}`}
          >
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 mt-0.5"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
