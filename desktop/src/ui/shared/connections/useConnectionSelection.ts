import { useEffect, useRef, useState } from "react";
import { useConnections } from "./useConnections";

export function useConnectionSelection() {
  const { activeConnectionName, isActiveConnectionLoaded } = useConnections();
  const [connectionName, setConnectionName] = useState(() =>
    isActiveConnectionLoaded ? activeConnectionName ?? "" : "",
  );
  const hasAppliedDefault = useRef(isActiveConnectionLoaded);

  useEffect(() => {
    if (hasAppliedDefault.current || !isActiveConnectionLoaded) return;

    hasAppliedDefault.current = true;
    setConnectionName((currentName) => currentName || activeConnectionName || "");
  }, [activeConnectionName, isActiveConnectionLoaded]);

  return { connectionName, setConnectionName };
}
