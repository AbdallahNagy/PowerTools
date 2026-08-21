import { createContext } from "react";

export interface ToolRuntimeContextValue {
  toolId: string;
  instanceId: string;
}

export const ToolRuntimeContext = createContext<
  ToolRuntimeContextValue | undefined
>(undefined);
