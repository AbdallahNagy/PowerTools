import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { StoredConnection } from "./connectionTypes.js";

/** A connection as written to connections.json. The MSAL account is rehydrated from its cache. */
export type PersistedConnection = StoredConnection extends infer C
  ? C extends { crmType: "online" }
    ? Omit<C, "account">
    : C
  : never;

export interface PersistedState {
  connections: PersistedConnection[];
  activeConnectionId: string | null;
}

/**
 * What connections.json may hold: the current shape, or the shape from before
 * connections had ids (keyed by `name`, with `activeConnectionName`).
 */
export interface RawPersistedState {
  connections: unknown[];
  activeConnectionId?: string | null;
  activeConnectionName?: string | null;
}

function stateFilePath(): string {
  return join(app.getPath("userData"), "connections.json");
}

export function loadState(): RawPersistedState {
  const path = stateFilePath();
  if (!existsSync(path)) return { connections: [] };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RawPersistedState>;
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      activeConnectionId: parsed.activeConnectionId ?? null,
      activeConnectionName: parsed.activeConnectionName ?? null,
    };
  } catch {
    return { connections: [] };
  }
}

export function saveState(state: PersistedState): void {
  try {
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist connections:", err);
  }
}
