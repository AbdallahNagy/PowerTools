import { useContext } from "react";
import { ConnectionsContext } from "./ConnectionsContext";

export function useConnections() {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error("useConnections must be used within ConnectionsProvider");
  }
  return context;
}
