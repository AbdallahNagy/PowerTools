import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { desktopBridge, type ConnectionManagerAction } from "../../platform/desktopBridge";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "./ConnectionsContext";
import { setActiveConnectionSnapshot } from "./activeConnectionSnapshot";
import { toConnectionInfo } from "./connectionNaming";
import type { ConnectionSummary } from "./types";

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<ConnectionSummary[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isActiveConnectionLoaded, setIsActiveConnectionLoaded] = useState(false);
  const activeConnectionVersion = useRef(0);

  // A layout effect, so a tool opened right after the active connection renders already sees it.
  useLayoutEffect(() => {
    setActiveConnectionSnapshot(activeConnectionId, isActiveConnectionLoaded);
  }, [activeConnectionId, isActiveConnectionLoaded]);

  useEffect(() => {
    return () => setActiveConnectionSnapshot(null, false);
  }, []);

  useEffect(() => {
    const initialActiveConnectionVersion = activeConnectionVersion.current;
    desktopBridge.listConnections().then(setSummaries);
    // The id and the loaded flag change in one render, so nothing sees the id before it counts as loaded.
    desktopBridge.getActiveConnectionId().then((id) => {
      if (activeConnectionVersion.current === initialActiveConnectionVersion) {
        setActiveConnectionId(id);
      }
      setIsActiveConnectionLoaded(true);
    }, () => {
      // Connection selection remains empty if startup hydration fails.
      setIsActiveConnectionLoaded(true);
    });

    desktopBridge.onConnectionStatusUpdate((id) => {
      activeConnectionVersion.current += 1;
      setActiveConnectionId(id);
      setIsActiveConnectionLoaded(true);
    });
    const unsubscribeConnections = desktopBridge.onConnectionsUpdated(setSummaries);

    return unsubscribeConnections;
  }, []);

  const connections = useMemo(() => summaries.map(toConnectionInfo), [summaries]);

  const createConnectionWindow = useCallback(
    () => desktopBridge.createConnectionWindow(),
    [],
  );
  const openConnectionManager = useCallback(
    (id?: string | null, action?: ConnectionManagerAction) => desktopBridge.openConnectionManager(id, action),
    [],
  );
  const deleteConnection = useCallback(
    (id: string) => desktopBridge.deleteConnection(id),
    [],
  );
  const setActiveConnection = useCallback(async (id: string) => {
    activeConnectionVersion.current += 1;
    const result = await desktopBridge.setActiveConnection(id);
    setActiveConnectionId(id);
    setIsActiveConnectionLoaded(true);
    return result;
  }, []);

  const value = useMemo<ConnectionsContextValue>(
    () => ({
      connections,
      activeConnectionId,
      isActiveConnectionLoaded,
      createConnectionWindow,
      openConnectionManager,
      deleteConnection,
      setActiveConnection,
    }),
    [
      activeConnectionId,
      connections,
      createConnectionWindow,
      deleteConnection,
      isActiveConnectionLoaded,
      openConnectionManager,
      setActiveConnection,
    ],
  );

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
}
