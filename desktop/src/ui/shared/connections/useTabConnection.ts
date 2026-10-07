import { useContext } from "react";
import { TabProviderContext } from "../../shell/tabs/TabProviderContext";
import { useToolRuntime } from "../../shell/tool-runtime/useToolRuntime";

export function useTabConnection() {
  const { connectionName, instanceId } = useToolRuntime();
  const tabs = useContext(TabProviderContext);

  return {
    connectionName,
    setConnectionName(name: string | null) {
      tabs?.setTabConnection(instanceId, name);
    },
  };
}
