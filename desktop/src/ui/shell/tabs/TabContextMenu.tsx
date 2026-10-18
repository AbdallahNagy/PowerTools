import { useState } from "react";

import {
  ConnectionMenuItems,
  ContextMenu,
  contextMenuItemClassName as itemClassName,
} from "../context-menu/ContextMenu";

interface TabContextMenuProps {
  x: number;
  y: number;
  connectionId: string | null;
  /** Show "Change connection". Off for tabs that do not use a connection. */
  canChangeConnection: boolean;
  canCloseOthers: boolean;
  onSelect: (connectionId: string) => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onClose: () => void;
}

export default function TabContextMenu({
  x,
  y,
  connectionId,
  canChangeConnection,
  canCloseOthers,
  onSelect,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onClose,
}: TabContextMenuProps) {
  const [listing, setListing] = useState(false);

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      {listing ? (
        <ConnectionMenuItems
          selectedId={connectionId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ) : (
        <>
          {canChangeConnection ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={itemClassName}
                onClick={() => setListing(true)}
              >
                Change connection
              </button>
              <div role="separator" className="my-1 border-t border-line" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={() => {
              onCloseTab();
              onClose();
            }}
          >
            Close
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canCloseOthers}
            className={itemClassName}
            onClick={() => {
              onCloseOthers();
              onClose();
            }}
          >
            Close others
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={() => {
              onCloseAll();
              onClose();
            }}
          >
            Close all
          </button>
        </>
      )}
    </ContextMenu>
  );
}
