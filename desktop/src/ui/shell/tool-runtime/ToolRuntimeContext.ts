import { createContext } from "react";

export interface ToolRuntimeContextValue {
  toolId: string;
  instanceId: string;
  connectionId: string | null;
}

export const ToolRuntimeContext = createContext<
  ToolRuntimeContextValue | undefined
>(undefined);
