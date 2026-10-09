import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { desktopBridge, type UpdateStatus } from "../../platform/desktopBridge";
import { UpdateContext, type UpdateContextValue } from "./updateContext";
import { shouldPromptForUpdate } from "./updateStatus";

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog opens by itself once per launch. After "Later" the user
  // reopens it from the update button in the title bar or status bar.
  const prompted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let changed = false;
    // A change event that arrives first is newer than the initial snapshot.
    const unsubscribe = desktopBridge.onUpdateStatusChanged((next) => {
      changed = true;
      setStatus(next);
    });
    void desktopBridge.getUpdateStatus().then((initial) => {
      if (!cancelled && !changed) {
        setStatus(initial);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!prompted.current && shouldPromptForUpdate(status)) {
      prompted.current = true;
      setDialogOpen(true);
    }
  }, [status]);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const download = useCallback(() => void desktopBridge.downloadUpdate(), []);
  const install = useCallback(() => void desktopBridge.installUpdate(), []);
  const retry = useCallback(() => void desktopBridge.checkForUpdates(), []);

  const value = useMemo<UpdateContextValue>(
    () => ({ status, dialogOpen, openDialog, closeDialog, download, install, retry }),
    [status, dialogOpen, openDialog, closeDialog, download, install, retry],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}
