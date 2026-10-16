import { useEffect, useRef, useState } from "react";
import { useTabConnection } from "../../../shared/connections";

/**
 * The connection this tool works against. When the tab's connection changes
 * while there are unsaved edits, the switch waits for the user to confirm.
 */
export function useSessionConnection(dirty: boolean) {
  const { connectionId: tabConnectionId, setConnectionId } = useTabConnection();
  const [sessionName, setSessionName] = useState<string | null>(tabConnectionId);
  const [pendingName, setPendingName] = useState<string | null | undefined>(undefined);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const sessionRef = useRef(sessionName);
  sessionRef.current = sessionName;

  useEffect(() => {
    if (tabConnectionId === sessionRef.current) {
      setPendingName(undefined);
      return;
    }
    if (!dirtyRef.current) {
      setSessionName(tabConnectionId);
      return;
    }
    setPendingName(tabConnectionId);
  }, [tabConnectionId]);

  return {
    connectionId: sessionName,
    ready: true,
    pendingName,
    confirmSwitch() {
      setSessionName(pendingName ?? null);
      setPendingName(undefined);
    },
    cancelSwitch() {
      setPendingName(undefined);
      setConnectionId(sessionRef.current);
    },
  };
}
