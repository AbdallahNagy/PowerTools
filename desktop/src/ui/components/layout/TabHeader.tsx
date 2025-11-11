import type { TabProps } from "../../common/types/tab-props.interface";

function Tab({ title, active = false, onClick, onClose }: TabProps) {
  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center h-9 px-4 border-t-2 border-transparent cursor-pointer select-none
        ${
          active
            ? "bg-(--dark-gray-color) text-white"
            : "bg-(--light-gray-color) text-(--text-gray-color) hover:text-white"
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
          className="invisible group-hover:visible border-0 w-4 h-4 flex items-center hover:bg-[#2d2d2d] justify-center ml-2"
        >
          <span>
            <svg
              className="w-4 h-4 text-gray-800 dark:text-white"
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
          </span>
        </button>
      )}
    </div>
  );
};

export default Tab;