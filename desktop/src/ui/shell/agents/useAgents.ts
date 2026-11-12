import { useCallback, useEffect, useRef, useState } from "react";

import { desktopBridge, type McpStatusInfo } from "../../platform/desktopBridge";
import { bridgeErrorMessage } from "../community-tools/bridgeErrorMessage";

export interface AgentsState {
  /** Null until the first read finishes, or when it failed. */
  status: McpStatusInfo | null;
  busy: boolean;
  error: string | null;
  setEnabled(enabled: boolean): Promise<void>;
  setGroup(group: string, enabled: boolean): Promise<void>;
  refresh(): Promise<void>;
}

/** The MCP server's state for the Agents dialog. Reads when `active` turns true. */
export function useAgents(active: boolean): AgentsState {
  const [status, setStatus] = useState<McpStatusInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Runs one bridge call, ignoring its result if a newer call has started or the dialog is gone.
  const run = useCallback(async (call: () => Promise<McpStatusInfo>) => {
    const request = ++latest.current;
    setBusy(true);
    try {
      const next = await call();
      if (!mounted.current || request !== latest.current) return;
      setStatus(next);
      setError(null);
    } catch (failure) {
      if (!mounted.current || request !== latest.current) return;
      setError(bridgeErrorMessage(failure));
    } finally {
      if (mounted.current && request === latest.current) setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => run(() => desktopBridge.getMcpStatus()), [run]);
  const setEnabled = useCallback((enabled: boolean) => run(() => desktopBridge.setMcpEnabled(enabled)), [run]);
  const setGroup = useCallback((group: string, enabled: boolean) => run(() => desktopBridge.setMcpGroup(group, enabled)), [run]);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  return { status, busy, error, setEnabled, setGroup, refresh };
}
