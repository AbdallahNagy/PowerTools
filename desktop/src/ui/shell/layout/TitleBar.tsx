import { useEffect, useState } from "react";
import { Copy, Minus, PanelLeft, Square, X } from "lucide-react";

import PowerToolsIcon from "../../assets/icons/power-tools-icon.svg";
import { desktopBridge } from "../../platform/desktopBridge";
import { UpdateButton } from "./UpdateButton";
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
      className="app-drag flex h-8 shrink-0 items-stretch bg-surface text-fg text-xs select-none border-b border-line"
    >
      <div className="app-no-drag flex items-stretch">
        <span className="flex items-center pl-2 pr-1">
          <img src={PowerToolsIcon} alt="Power Tools" className="h-5 w-5" />
        </span>
        {TITLE_BAR_MENUS.map((menuId) => (
          <button
            key={menuId}
            type="button"
            aria-haspopup="menu"
            aria-label={TITLE_BAR_MENU_LABELS[menuId]}
            className="px-2.5 hover:bg-hover hover:text-fg-strong"
            onClick={(event) => popupMenu(menuId, event.currentTarget)}
          >
            {TITLE_BAR_MENU_LABELS[menuId]}
          </button>
        ))}

        <button
          type="button"
          aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarVisible}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          className={`flex w-8 items-center justify-center hover:bg-hover hover:text-fg-strong ml-12 ${sidebarVisible ? "text-accent-text" : ""
            }`}
          onClick={onToggleSidebar}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        className="flex flex-1 items-center justify-center text-fg-muted"
        onDoubleClick={() => {
          void desktopBridge.toggleMaximizeWindow();
        }}
      >
        Power Tools
      </div>

      <div className="app-no-drag ml-auto flex items-stretch">
        <UpdateButton placement="title-bar" />
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          className="flex w-11 items-center justify-center hover:bg-hover hover:text-fg-strong"
          onClick={() => {
            void desktopBridge.minimizeWindow();
          }}
        >
          <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
          className="flex w-11 items-center justify-center hover:bg-hover hover:text-fg-strong"
          onClick={() => {
            void desktopBridge.toggleMaximizeWindow();
          }}
        >
          {maximized ? (
            <Copy size={12} strokeWidth={1.5} className="-scale-x-100" aria-hidden="true" />
          ) : (
            <Square size={12} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          className="flex w-11 items-center justify-center hover:bg-hover hover:text-fg-strong"
          onClick={() => {
            void desktopBridge.closeWindow();
          }}
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
