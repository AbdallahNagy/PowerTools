import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "../../shared/ui";

interface TabProps {
  id: string;
  title: string;
  /** Drawn before the title, usually the tool's icon. */
  icon?: ReactNode;
  /** Display name of the tab's connection. */
  connectionLabel?: string | null;
  /** The tab works against production; the header turns red so it is hard to miss. */
  production?: boolean;
  active?: boolean;
  /** The tab is being dragged along the strip. */
  dragging?: boolean;
  onClick?: () => void;
  onClose?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onPointerDown?: (event: React.PointerEvent) => void;
}

function Tab({
  id,
  title,
  icon,
  connectionLabel,
  production = false,
  active = false,
  dragging = false,
  onClick,
  onClose,
  onContextMenu,
  onPointerDown,
}: TabProps) {
  const label = connectionLabel
    ? `${title}, ${connectionLabel}${production ? " (production)" : ""}`
    : title;

  return (
    <div
      role="presentation"
      data-tab-id={id}
      data-active={active}
      data-production={production || undefined}
      data-dragging={dragging || undefined}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onMouseDown={(event) => {
        // Middle click closes the tab; stop Windows from starting autoscroll.
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) onClose?.();
      }}
      className={cn(
        "group relative flex h-9 max-w-64 shrink-0 select-none items-center border-r border-line",
        active ? "bg-canvas text-fg-strong" : "text-fg hover:bg-hover hover:text-fg-strong",
        dragging && "z-10 bg-raised text-fg-strong shadow-lg",
      )}
    >
      {production ? (
        <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0", active ? "bg-danger-soft" : "bg-danger-soft/60")} />
      ) : null}
      {/* The line along the top marks the active tab, and production in red on every tab. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5",
          production ? (active ? "bg-danger" : "bg-danger/50") : active ? "bg-accent-text" : "bg-transparent",
        )}
      />
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={label}
        title={label}
        tabIndex={active ? 0 : -1}
        onClick={onClick}
        className="relative flex h-full min-w-0 flex-1 items-center gap-2 pl-3 pr-1.5 text-left"
      >
        {icon}
        <span className="truncate">{title}</span>
        {connectionLabel ? (
          <span className={cn("max-w-32 truncate text-xs", production ? "text-danger" : "text-fg-muted")}>
            {connectionLabel}
          </span>
        ) : null}
      </button>
      {onClose && (
        <button
          type="button"
          data-tab-close=""
          aria-label={`Close ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className={cn(
            "relative mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-muted",
            "hover:bg-line-strong hover:text-fg-strong focus-visible:opacity-100 group-hover:opacity-100",
            active ? "opacity-100" : "opacity-0",
          )}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default Tab;
