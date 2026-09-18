import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
}: ModalProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setOffset({ x: 0, y: 0 });
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    const move = (moveEvent: PointerEvent) => {
      if (!drag.current) return;
      setOffset({
        x: drag.current.originX + moveEvent.clientX - drag.current.startX,
        y: drag.current.originY + moveEvent.clientY - drag.current.startY,
      });
    };
    const stop = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      data-testid="modal-backdrop"
    >
      <div
        className={`bg-[var(--color-bg-darker)] border border-[#3c3c3c] rounded-sm shadow-xl w-full ${widthClass} max-h-[85vh] flex flex-col`}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b border-[#3c3c3c] cursor-move select-none"
          onPointerDown={startDrag}
        >
          <h3 className="text-sm font-semibold text-[var(--color-text-white)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-[#858585] hover:text-[var(--color-text-white)]"
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
