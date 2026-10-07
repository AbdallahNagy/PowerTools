import type { TabProps } from "../../common/types/tab-props.interface";

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
            <svg
              className="w-3.5 h-3.5 text-fg-muted"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18 17.94 6M18 18 6.06 6"
              />
            </svg>
        </button>
      )}
    </div>
  );
};

export default Tab;