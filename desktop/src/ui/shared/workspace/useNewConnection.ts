import { useCallback, useContext } from "react";

import { ConnectionsContext } from "../connections/ConnectionsContext";

/** Opens the window that adds a Dataverse connection. Does nothing outside the app shell. */
export function useNewConnection(): () => void {
  const create = useContext(ConnectionsContext)?.createConnectionWindow;
  return useCallback(() => void create?.(), [create]);
}
