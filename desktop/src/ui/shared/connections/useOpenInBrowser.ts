import { useCallback, useContext } from "react";

import { desktopBridge, type OpenUrlResult } from "../../platform/desktopBridge";
import { ToolRuntimeContext } from "../../shell/tool-runtime/ToolRuntimeContext";
import { ToastContext } from "../ui/ToastContext";

/**
 * Opens a Dataverse page in the browser and profile the user chose for the
 * connection. Use this instead of `openExternalUrl` for anything that belongs
 * to an environment, such as a record or a solution.
 *
 * @param connectionId The connection the page belongs to. Defaults to the tab's
 * connection, then the active connection.
 */
export function useOpenInBrowser(connectionId?: string | null): (url: string) => Promise<OpenUrlResult> {
  const runtime = useContext(ToolRuntimeContext);
  const toast = useContext(ToastContext);
  const id = connectionId === undefined ? runtime?.connectionId ?? null : connectionId;

  return useCallback(
    async (url: string) => {
      try {
        const result = await desktopBridge.openUrlForConnection(id, url);
        if (result.fallback) {
          toast?.showToast(
            "The browser chosen for this connection was not found, so the default browser opened. Change it in Manage connections.",
            "info",
          );
        }
        return result;
      } catch (error) {
        toast?.showToast((error as Error).message || "The page could not be opened.", "error");
        return { fallback: false };
      }
    },
    [id, toast],
  );
}
