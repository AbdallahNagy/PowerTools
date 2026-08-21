import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { desktopBridge } from "../../platform/desktopBridge";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "./ConnectionsContext";
import type { ConnectionInfo } from "./types";

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [activeConnectionName, setActiveConnectionName] = useState<string | null>(null);
  const [isActiveConnectionLoaded, setIsActiveConnectionLoaded] = useState(false);
  const activeConnectionVersion = useRef(0);

  useEffect(() => {
    const initialActiveConnectionVersion = activeConnectionVersion.current;
    desktopBridge.listConnections().then(setConnections);
    desktopBridge.getActiveConnectionName().then((name) => {
      if (activeConnectionVersion.current === initialActiveConnectionVersion) {
        setActiveConnectionName(name);
      }
    }).catch(() => {
      // Connection selection remains empty if startup hydration fails.
    }).finally(() => {
      setIsActiveConnectionLoaded(true);
    });

    desktopBridge.onConnectionStatusUpdate((name) => {
      activeConnectionVersion.current += 1;
      setActiveConnectionName(name);
      setIsActiveConnectionLoaded(true);
    });
    const unsubscribeConnections = desktopBridge.onConnectionsUpdated(setConnections);

    return unsubscribeConnections;
  }, []);

  const createConnectionWindow = useCallback(
    () => desktopBridge.createConnectionWindow(),
    [],
  );
  const deleteConnection = useCallback(
    (name: string) => desktopBridge.deleteConnection(name),
    [],
  );
  const setActiveConnection = useCallback(async (name: string) => {
    activeConnectionVersion.current += 1;
    const result = await desktopBridge.setActiveConnection(name);
    setActiveConnectionName(name);
    setIsActiveConnectionLoaded(true);
    return result;
  }, []);

  const value = useMemo<ConnectionsContextValue>(
    () => ({
      connections,
      activeConnectionName,
      isActiveConnectionLoaded,
      createConnectionWindow,
      deleteConnection,
      setActiveConnection,
    }),
    [
      activeConnectionName,
      connections,
      createConnectionWindow,
      deleteConnection,
      isActiveConnectionLoaded,
      setActiveConnection,
    ],
  );

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
}
