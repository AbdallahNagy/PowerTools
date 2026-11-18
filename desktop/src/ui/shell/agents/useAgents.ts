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
  setTool(name: string, enabled: boolean): Promise<void>;
  refresh(): Promise<void>;
}

/**
 * The MCP server's state for the Agents section of Settings. Reads when `active` turns true and
 * keeps the last status meanwhile, so the section shows what it knows at once and corrects itself
 * when the read returns, instead of drawing "off" first.
 */
export function useAgents(active: boolean): AgentsState {
  const [status, setStatus] = useState<McpStatusInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(0);
  const loaded = useRef(false);
  const latestFailed = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Runs one bridge call, ignoring its result if a newer call has started or the dialog is gone.
  // A quiet call does not mark the section busy, so its controls do not dim while it runs.
  const run = useCallback(async (call: () => Promise<McpStatusInfo>, quiet = false) => {
    const request = ++latest.current;
    setBusy(!quiet);
    try {
      const next = await call();
      if (!mounted.current || request !== latest.current) return;
      loaded.current = true;
      latestFailed.current = false;
      setStatus(next);
      setError(null);
    } catch (failure) {
      if (!mounted.current || request !== latest.current) return;
      latestFailed.current = true;
      setError(bridgeErrorMessage(failure));
    } finally {
      if (mounted.current && request === latest.current) setBusy(false);
    }
  }, []);

  // Re-reading a status that is already on screen is quiet; only the first read shows as loading.
  const refresh = useCallback(() => run(() => desktopBridge.getMcpStatus(), loaded.current), [run]);
  const setEnabled = useCallback((enabled: boolean) => run(() => desktopBridge.setMcpEnabled(enabled)), [run]);
  // A group or tool switch flips at once and saves quietly, so the other switches neither dim nor redraw while
  // main answers. Main's answer replaces the guess; if the call fails, the switch goes back and the error shows.
  const flip = useCallback(
    async (guess: (current: McpStatusInfo) => McpStatusInfo, call: () => Promise<McpStatusInfo>, undo: typeof guess) => {
      setStatus((current) => (current ? guess(current) : current));
      await run(call, true);
      if (mounted.current && latestFailed.current) setStatus((current) => (current ? undo(current) : current));
    },
    [run],
  );
  const setGroup = useCallback(
    (group: string, enabled: boolean) => {
      const to = (value: boolean) => (current: McpStatusInfo) => ({
        ...current,
        groups: current.groups.map((g) => (g.group === group ? { ...g, enabled: value } : g)),
      });
      return flip(to(enabled), () => desktopBridge.setMcpGroup(group, enabled), to(!enabled));
    },
    [flip],
  );
  const setTool = useCallback(
    (name: string, enabled: boolean) => {
      const to = (value: boolean) => (current: McpStatusInfo) => ({
        ...current,
        tools: (current.tools ?? []).map((t) => (t.name === name ? { ...t, enabled: value } : t)),
      });
      return flip(to(enabled), () => desktopBridge.setMcpTool(name, enabled), to(!enabled));
    },
    [flip],
  );

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  return { status, busy, error, setEnabled, setGroup, setTool, refresh };
}
