import { useContext } from "react";
import { StatusItemsContext } from "./StatusContext";

export function useStatusItems() {
  const items = useContext(StatusItemsContext);
  if (!items) {
    throw new Error("useStatusItems must be used within StatusBarProvider");
  }
  return items;
}
