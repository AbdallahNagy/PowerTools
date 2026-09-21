import { useEffect, type ReactNode } from "react";
import { Spinner } from "./Spinner";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  zClass?: string;
  nested?: boolean;
  busy?: boolean;
  busyLabel?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
  zClass = "z-50",
  nested = false,
  busy = false,
  busyLabel = "Working…",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (busy) return;
      if (nested) e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", handler, nested);
    return () => document.removeEventListener("keydown", handler, nested);
  }, [open, onClose, nested, busy]);

  if (!open) return null;

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 p-6`}
      onMouseDown={handleClose}
    >
      <div
        className={`relative bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-xl w-full ${widthClass} max-h-[85vh] flex flex-col overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
        aria-busy={busy}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3c3c3c]">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="text-[#858585] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1 min-h-0 flex flex-col gap-4">
          {children}
        </div>
        {busy ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg-darker)]/80 cursor-wait"
            role="status"
            aria-live="polite"
            aria-label={busyLabel}
          >
            <Spinner size={32} />
            <p className="text-sm text-[var(--color-text-gray)]">{busyLabel}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
