import { useCallback, useEffect, useState } from "react";

import { desktopBridge, type McpApprovalRequest } from "../../platform/desktopBridge";

/** Agent calls waiting for the user. Main sends them one at a time; the first is the one to show. */
export function useApprovalRequests() {
  const [queue, setQueue] = useState<McpApprovalRequest[]>([]);

  useEffect(() => {
    try {
      const offPresent = desktopBridge.onMcpApprovalPresent((request) =>
        setQueue((current) => (current.some((r) => r.id === request.id) ? current : [...current, request])),
      );
      const offDismiss = desktopBridge.onMcpApprovalDismiss((id) =>
        setQueue((current) => current.filter((r) => r.id !== id)),
      );
      return () => {
        offPresent();
        offDismiss();
      };
    } catch {
      // No desktop bridge, for example in a plain browser: nothing can ask.
      return undefined;
    }
  }, []);

  const respond = useCallback((id: string, allow: boolean) => {
    setQueue((current) => current.filter((r) => r.id !== id));
    void desktopBridge.respondMcpApproval(id, allow).catch(() => undefined);
  }, []);

  return { current: queue[0] ?? null, respond };
}
