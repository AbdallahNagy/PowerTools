import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { APP_MODAL_ATTRIBUTE } from "../keyboard/appModal";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional one-line explanation under the title, read by screen readers. */
  description?: string;
  widthClass?: string;
  zClass?: string;
  /**
   * Kept for callers that open a modal from another modal. Radix stacks
   * dialogs itself, so Escape and outside clicks only close the top one.
   */
  nested?: boolean;
  busy?: boolean;
  busyLabel?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  description,
  widthClass = "max-w-2xl",
  zClass = "z-50",
  busy = false,
  busyLabel = "Working…",
}: ModalProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          {...{ [APP_MODAL_ATTRIBUTE]: "" }}
          className={cn("fixed inset-0 flex items-center justify-center bg-black/50 p-6", zClass)}
        >
          <Dialog.Content
            className={cn(
              "relative w-full max-h-[85vh] flex flex-col overflow-hidden",
              "bg-surface border border-line rounded-sm shadow-xl focus:outline-none",
              widthClass,
            )}
            aria-busy={busy}
            {...(description ? {} : { "aria-describedby": undefined })}
            onOpenAutoFocus={(event) => {
              // Keep focus on a field the dialog focused itself (autoFocus);
              // otherwise focus the panel rather than the close button.
              event.preventDefault();
              const panel = event.currentTarget as HTMLElement | null;
              if (panel && !panel.contains(document.activeElement)) panel.focus();
            }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
              <Dialog.Title asChild>
                <h3 className="text-sm font-semibold text-fg-strong">{title}</h3>
              </Dialog.Title>
              <Dialog.Close
                disabled={busy}
                aria-label="Close"
                className="rounded-sm p-0.5 text-fg-muted hover:text-fg-strong hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={16} aria-hidden="true" />
              </Dialog.Close>
            </div>
            {description ? (
              <Dialog.Description className="px-4 pt-3 text-xs text-fg-muted">{description}</Dialog.Description>
            ) : null}
            <div className="p-4 overflow-auto flex-1 min-h-0 flex flex-col gap-4">{children}</div>
            {busy ? (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface/80 cursor-wait"
                role="status"
                aria-live="polite"
                aria-label={busyLabel}
              >
                <Spinner size={32} />
                <p className="text-sm text-fg">{busyLabel}</p>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
