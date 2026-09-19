import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  zClass?: string;
  nested?: boolean;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
  zClass = "z-50",
  nested = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (nested) e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", handler, nested);
    return () => document.removeEventListener("keydown", handler, nested);
  }, [open, onClose, nested]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 p-6`}
      onMouseDown={onClose}
    >
      <div
        className={`bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-xl w-full ${widthClass} max-h-[85vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3c3c3c]">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#858585] hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1 min-h-0 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}
