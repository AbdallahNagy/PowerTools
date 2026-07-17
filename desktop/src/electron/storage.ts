import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export type PersistedConnection =
  | {
      name: string;
      envUrl: string;
      crmType: "online";
      homeAccountId: string | null;
    }
  | {
      name: string;
      envUrl: string;
      crmType: "onpremise";
      authMode: "ad" | "ifd";
      username: string;
      domain: string;
      encryptedPassword: string;
    };

export interface PersistedState {
  connections: PersistedConnection[];
  activeConnectionName: string | null;
}

const EMPTY_STATE: PersistedState = {
  connections: [],
  activeConnectionName: null,
};

function stateFilePath(): string {
  return join(app.getPath("userData"), "connections.json");
}

export function loadState(): PersistedState {
  const path = stateFilePath();
  if (!existsSync(path)) return { ...EMPTY_STATE };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      activeConnectionName: parsed.activeConnectionName ?? null,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state: PersistedState): void {
  try {
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist connections:", err);
  }
}
