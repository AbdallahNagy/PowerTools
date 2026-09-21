import { useEffect, useState } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import { TITLE_BAR_MENU_LABELS, TITLE_BAR_MENUS, type TitleBarMenuId } from "./titleBarMenus";

interface TitleBarProps {
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}

function popupMenu(menuId: TitleBarMenuId, target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  void desktopBridge.popupAppMenu(menuId, rect.left, rect.bottom);
}

const TitleBar = ({ sidebarVisible, onToggleSidebar }: TitleBarProps) => {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.isWindowMaximized().then((value) => {
      if (!cancelled) {
        setMaximized(value);
      }
    });
    const unsubscribe = desktopBridge.onWindowMaximizedChanged(setMaximized);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <header
      data-testid="title-bar"
      className="app-drag flex h-8 shrink-0 items-stretch bg-[var(--color-bg-darker)] text-[var(--color-text-gray)] text-xs select-none border-b border-[var(--color-border-dark)]"
    >
      <div className="app-no-drag flex items-stretch">
        <button
          type="button"
          aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarVisible}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          className={`flex w-8 items-center justify-center hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)] ${
            sidebarVisible ? "text-[var(--color-primary)]" : ""
          }`}
          onClick={onToggleSidebar}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="M9 4v16" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        {TITLE_BAR_MENUS.map((menuId) => (
          <button
            key={menuId}
            type="button"
            aria-haspopup="menu"
            aria-label={TITLE_BAR_MENU_LABELS[menuId]}
            className="px-2.5 hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
            onClick={(event) => popupMenu(menuId, event.currentTarget)}
          >
            {TITLE_BAR_MENU_LABELS[menuId]}
          </button>
        ))}
      </div>

      <div
        className="flex flex-1 items-center justify-center text-[var(--color-text-dark-gray)]"
        onDoubleClick={() => {
          void desktopBridge.toggleMaximizeWindow();
        }}
      >
        Power Tools
      </div>

      <div className="app-no-drag ml-auto flex items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          className="flex w-11 items-center justify-center hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
          onClick={() => {
            void desktopBridge.minimizeWindow();
          }}
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
          className="flex w-11 items-center justify-center hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
          onClick={() => {
            void desktopBridge.toggleMaximizeWindow();
          }}
        >
          {maximized ? (
            <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M3.5 4.5h6v6h-6zM2.5 7.5V2.5h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
              <rect
                x="2.5"
                y="2.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          className="flex w-11 items-center justify-center hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
          onClick={() => {
            void desktopBridge.closeWindow();
          }}
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
