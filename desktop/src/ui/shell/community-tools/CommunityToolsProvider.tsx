import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { desktopBridge, type LoadedCommunityTool } from "../../platform/desktopBridge";
import { CommunityToolsContext } from "./CommunityToolsContext";
import { bridgeErrorMessage } from "./bridgeErrorMessage";
import { CommunityToolsDialog } from "./CommunityToolsDialog";
import { createToolRegistryView, type CommunityDefinitionCache } from "./useToolRegistry";

/**
 * Loads the remembered community tools, offers the ready and consented ones through the registry,
 * and owns the manager dialog. Nothing is offered while the first list is loading, and a failed
 * list behaves as if there were no community tools.
 */
export function CommunityToolsProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<LoadedCommunityTool[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const latestRequest = useRef(0);
  const mounted = useRef(true);
  const cache = useRef<CommunityDefinitionCache>(new Map());

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const next = await desktopBridge.listCommunityTools();
      if (!mounted.current || request !== latestRequest.current) return;
      setTools(next);
      setLoadError(null);
    } catch (error) {
      if (!mounted.current || request !== latestRequest.current) return;
      setTools([]);
      setLoadError(bridgeErrorMessage(error));
    }
  }, []);

  const openManager = useCallback(() => {
    setManagerOpen(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = desktopBridge.onOpenCommunityTools(openManager);
    } catch {
      // No desktop bridge, for example in a plain browser: the menu item does not exist either.
    }
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [openManager, refresh]);

  const registry = useMemo(() => createToolRegistryView(tools, cache.current), [tools]);
  const value = useMemo(
    () => ({ tools, refresh, openManager, registry }),
    [openManager, refresh, registry, tools],
  );

  return (
    <CommunityToolsContext.Provider value={value}>
      {children}
      <CommunityToolsDialog
        open={managerOpen}
        tools={tools}
        loadError={loadError}
        refresh={refresh}
        onClose={() => setManagerOpen(false)}
      />
    </CommunityToolsContext.Provider>
  );
}
