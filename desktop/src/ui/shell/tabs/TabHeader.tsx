import { X } from "lucide-react";

interface TabProps {
  title: string;
  /** Display name of the tab's connection. */
  connectionLabel?: string | null;
  /** The tab works against production; the header turns red so it is hard to miss. */
  production?: boolean;
  content?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

function Tab({
  title,
  connectionLabel,
  production = false,
  active = false,
  onClick,
  onClose,
  onContextMenu,
}: TabProps) {
  const label = connectionLabel
    ? `${title}, ${connectionLabel}${production ? " (production)" : ""}`
    : title;

  return (
    <div
      aria-label={label}
      title={label}
      data-active={active}
      data-production={production || undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex shrink-0 items-center h-9 max-w-64 px-4 border-t-2 cursor-pointer select-none
        ${
          production
            ? active
              ? "border-danger bg-danger-soft text-fg-strong"
              : "border-danger/50 bg-danger-soft/60 text-fg hover:text-fg-strong"
            : active
              ? "border-transparent bg-canvas text-fg-strong"
              : "border-transparent bg-raised text-fg hover:text-fg-strong"
        }
      `}
    >
      <span className="mr-2 truncate">{title}</span>
      {connectionLabel ? (
        <span className={`mr-2 max-w-32 truncate text-xs ${production ? "text-danger" : "text-fg-muted"}`}>
          {connectionLabel}
        </span>
      ) : null}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="invisible group-hover:visible rounded-sm p-0.5 flex items-center justify-center ml-2 cursor-pointer hover:bg-hover hover:text-fg-strong transition-colors"
        >
            <X size={14} className="text-fg-muted" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default Tab;