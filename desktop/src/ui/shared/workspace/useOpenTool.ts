import { useCallback, useContext } from "react";

import { TabProviderContext } from "../../shell/tabs/TabProviderContext";

/**
 * Opens a tool in a new tab, bound to the active connection, the same way the activity bar does.
 * A tool that allows one tab is activated instead. Does nothing outside the app shell.
 */
export function useOpenTool(): (toolId: string) => void {
  const openTool = useContext(TabProviderContext)?.openTool;
  return useCallback((toolId: string) => openTool?.(toolId), [openTool]);
}
