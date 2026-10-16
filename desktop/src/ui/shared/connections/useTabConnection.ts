import { useContext } from "react";
import { TabProviderContext } from "../../shell/tabs/TabProviderContext";
import { useToolRuntime } from "../../shell/tool-runtime/useToolRuntime";

/** The connection this tab works against. `connectionId` is the key to pass to API helpers. */
export function useTabConnection() {
  const { connectionId, instanceId } = useToolRuntime();
  const tabs = useContext(TabProviderContext);

  return {
    connectionId,
    setConnectionId(id: string | null) {
      tabs?.setTabConnection(instanceId, id);
    },
  };
}
