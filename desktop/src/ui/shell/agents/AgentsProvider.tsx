import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import { AgentsContext } from "./AgentsContext";
import { AgentsDialog } from "./AgentsDialog";

/** Owns the Agents (MCP) dialog and opens it from the File menu or the command palette. */
export function AgentsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAgents = useCallback(() => setOpen(true), []);

  useEffect(() => {
    try {
      return desktopBridge.onOpenAgents(openAgents);
    } catch {
      // No desktop bridge, for example in a plain browser: the menu item does not exist either.
      return undefined;
    }
  }, [openAgents]);

  const value = useMemo(() => ({ openAgents }), [openAgents]);
  return (
    <AgentsContext.Provider value={value}>
      {children}
      <AgentsDialog open={open} onClose={() => setOpen(false)} />
    </AgentsContext.Provider>
  );
}
