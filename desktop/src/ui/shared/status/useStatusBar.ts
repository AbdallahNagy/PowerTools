import { useContext } from "react";
import { StatusContext } from "./StatusContext";

export function useStatusBar() {
  const context = useContext(StatusContext);
  if (!context) {
    throw new Error("useStatusBar must be used within StatusBarProvider");
  }
  return context;
}
