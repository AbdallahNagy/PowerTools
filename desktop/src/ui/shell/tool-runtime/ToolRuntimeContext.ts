import { createContext } from "react";

export interface ToolRuntimeContextValue {
  toolId: string;
  instanceId: string;
  connectionName: string | null;
}

export const ToolRuntimeContext = createContext<
  ToolRuntimeContextValue | undefined
>(undefined);
