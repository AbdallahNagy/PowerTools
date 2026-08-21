import { useEffect, useMemo, type ReactNode } from "react";
import { useToolRuntime } from "../../shell/tool-runtime/useToolRuntime";
import { useStatusActions } from "./useStatusActions";

export function useToolStatus(content: ReactNode) {
  const { instanceId } = useToolRuntime();
  const { setStatus, clearStatus } = useStatusActions();
  const statusId = useMemo(() => `tool:${instanceId}`, [instanceId]);

  useEffect(() => {
    if (content == null) {
      clearStatus(statusId);
      return;
    }

    setStatus(statusId, content);
    return () => clearStatus(statusId);
  }, [clearStatus, content, setStatus, statusId]);
}
