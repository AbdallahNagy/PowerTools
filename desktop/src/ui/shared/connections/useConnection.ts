import { useContext } from "react";
import { ConnectionsContext } from "./ConnectionsContext";
import type { ConnectionInfo } from "./types";

/** Looks up a connection by id, for its display name and details. Null outside ConnectionsProvider. */
export function useConnection(id: string | null | undefined): ConnectionInfo | null {
  const context = useContext(ConnectionsContext);
  if (!id || !context) return null;
  return context.connections.find((connection) => connection.id === id) ?? null;
}
