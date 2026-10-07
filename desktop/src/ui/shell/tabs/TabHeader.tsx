import { X } from "lucide-react";

interface TabProps {
  title: string;
  connectionName?: string | null;
  content?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

function Tab({
  title,
  connectionName,
  active = false,
  onClick,
  onClose,
  onContextMenu,
}: TabProps) {
  const label = connectionName ? `${title}, ${connectionName}` : title;

  return (
    <div
      aria-label={label}
      title={label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex items-center h-9 px-4 border-t-2 border-transparent cursor-pointer select-none
        ${
          active
            ? "bg-canvas text-fg-strong"
            : "bg-raised text-fg hover:text-fg-strong"
        }
      `}
    >
      <span className="mr-2 truncate">{title}</span>
      {connectionName ? (
        <span className="mr-2 max-w-32 truncate text-xs text-fg-muted">
          {connectionName}
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