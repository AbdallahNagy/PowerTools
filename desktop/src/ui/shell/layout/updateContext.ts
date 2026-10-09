import { createContext, useContext } from "react";
import type { UpdateStatus } from "../../platform/desktopBridge";

export interface UpdateContextValue {
  status: UpdateStatus;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  download: () => void;
  install: () => void;
  retry: () => void;
}

export const UpdateContext = createContext<UpdateContextValue | null>(null);

/** Update state from UpdateProvider, or null when rendered outside the shell. */
export function useUpdate() {
  return useContext(UpdateContext);
}
