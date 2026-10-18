import { useState } from "react";

import { useConnections } from "../../shared/connections";
import {
  ConnectionMenuItems,
  ContextMenu,
  contextMenuItemClassName as itemClassName,
} from "../context-menu/ContextMenu";

interface ToolContextMenuProps {
  x: number;
  y: number;
  toolTitle: string;
  /** Open the tool with the active connection. */
  onOpen: () => void;
  /** Open the tool bound to the chosen connection. */
  onOpenWithConnection: (connectionId: string) => void;
  onClose: () => void;
}

export default function ToolContextMenu({
  x,
  y,
  toolTitle,
  onOpen,
  onOpenWithConnection,
  onClose,
}: ToolContextMenuProps) {
  const { activeConnectionId, connections, isActiveConnectionLoaded } = useConnections();
  const [listing, setListing] = useState(false);
  const activeName = isActiveConnectionLoaded
    ? connections.find((connection) => connection.id === activeConnectionId)?.displayName ?? null
    : null;

  return (
    <ContextMenu x={x} y={y} label={toolTitle} onClose={onClose}>
      {listing ? (
        <ConnectionMenuItems
          selectedId={null}
          onSelect={onOpenWithConnection}
          onClose={onClose}
        />
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={() => {
              onOpen();
              onClose();
            }}
          >
            {activeName ? `Open with ${activeName}` : "Open"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={() => setListing(true)}
          >
            Open with another connection…
          </button>
        </>
      )}
    </ContextMenu>
  );
}
