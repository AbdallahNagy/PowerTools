import { useCallback, useEffect, useRef, useState } from "react";

import { desktopBridge, type McpStatusInfo } from "../../platform/desktopBridge";

export interface McpServerState {
  /** Null until the first read finishes, or when it failed. */
  status: McpStatusInfo | null;
  /** True while turning the server on. */
  starting: boolean;
  turnOn(): Promise<void>;
  refresh(): Promise<void>;
}

/**
 * The MCP server's status for screens outside Settings, such as the welcome page. Reads once on
 * mount; call `refresh` when the user may have changed it elsewhere. A failed read leaves the
 * last status, so the screen never flips to "off" because of one bad call.
 */
export function useMcpServer(): McpServerState {
  const [status, setStatus] = useState<McpStatusInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback(async (call: () => Promise<McpStatusInfo>) => {
    const request = ++latest.current;
    try {
      const next = await call();
      if (mounted.current && request === latest.current) setStatus(next);
    } catch {
      // Keep the last status; Settings shows the error in full.
    }
  }, []);

  const refresh = useCallback(() => apply(() => desktopBridge.getMcpStatus()), [apply]);

  const turnOn = useCallback(async () => {
    setStarting(true);
    try {
      await apply(() => desktopBridge.setMcpEnabled(true));
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, starting, turnOn, refresh };
}
