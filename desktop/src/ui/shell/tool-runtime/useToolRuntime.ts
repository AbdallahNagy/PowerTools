import { useContext } from "react";
import { ToolRuntimeContext } from "./ToolRuntimeContext";

export function useToolRuntime() {
  const context = useContext(ToolRuntimeContext);
  if (!context) {
    throw new Error("useToolRuntime must be used within a ToolHost");
  }
  return context;
}
