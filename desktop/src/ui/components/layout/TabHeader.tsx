import type { TabProps } from "../../common/types/tab-props.interface";

function Tab({ title, active = false, onClick, onClose }: TabProps) {
  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center h-9 px-4 border-t-2 border-transparent cursor-pointer select-none
        ${
          active
            ? "bg-(--color-bg-dark) text-white"
            : "bg-(--color-bg-light) text-(--color-text-gray) hover:text-white"
        }
      `}
    >
      <span className="mr-2">{title}</span>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="invisible group-hover:visible rounded-sm p-0.5 flex items-center justify-center ml-2 cursor-pointer hover:bg-(--color-hover-bg) hover:text-white transition-colors"
        >
            <svg
              className="w-3.5 h-3.5 text-(--color-text-dark-gray)"
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