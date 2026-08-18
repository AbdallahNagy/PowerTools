import { useContext } from "react";

import { StatusBarProviderContext } from "./StatusBarProviderContext";

export function useStatusBar() {
  const ctx = useContext(StatusBarProviderContext);
  if (!ctx) {
    throw new Error("useStatusBar must be used within StatusBarProvider");
  }
  return ctx;
}
