import { useCallback, useEffect, useState } from "react";

import { desktopBridge, type McpApprovalRequest } from "../../platform/desktopBridge";

/** Agent calls waiting for the user. Main sends them one at a time; the first is the one to show. */
export function useApprovalRequests() {
  const [queue, setQueue] = useState<McpApprovalRequest[]>([]);

  useEffect(() => {
    try {
      let live = true;
      // Ids taken down while the pending request was being fetched, so a late answer cannot bring one back.
      const dismissed = new Set<string>();
      const add = (request: McpApprovalRequest) =>
        setQueue((current) => (current.some((r) => r.id === request.id) ? current : [...current, request]));
      const offPresent = desktopBridge.onMcpApprovalPresent(add);
      const offDismiss = desktopBridge.onMcpApprovalDismiss((id) => {
        dismissed.add(id);
        setQueue((current) => current.filter((r) => r.id !== id));
      });
      // A request presented before this window listened (while it loaded or reloaded) would otherwise wait unseen
      // until it timed out, holding every request behind it.
      void desktopBridge
        .getPendingMcpApproval()
        .then((request) => {
          if (live && request && !dismissed.has(request.id)) add(request);
        })
        .catch(() => undefined);
      return () => {
        live = false;
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
