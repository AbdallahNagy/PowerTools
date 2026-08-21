import { useContext } from "react";
import { StatusActionsContext } from "./StatusContext";

export function useStatusActions() {
  const context = useContext(StatusActionsContext);
  if (!context) {
    throw new Error("useToolStatus must be used within StatusBarProvider");
  }
  return context;
}
