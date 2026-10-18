import { randomUUID } from "crypto";
import {
  BROWSER_IDS,
  type BrowserChoice,
  type ConnectionDescription,
  type ConnectionSummary,
  type StoredConnection,
} from "./connectionTypes.js";
import type { PersistedConnection, PersistedState, RawPersistedState } from "./storage.js";

export type DescriptionPatch = Partial<ConnectionDescription>;

export type StoreResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

type NewConnection = StoredConnection extends infer C
  ? C extends StoredConnection
    ? Omit<C, "id" | "legacyName"> & { id?: string; legacyName?: string }
    : never
  : never;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Trims a description field. Blank means not set. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanBrowser(value: unknown): BrowserChoice | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" || !(BROWSER_IDS as readonly string[]).includes(id)) return null;
  const profile = cleanText(value.profile);
  return profile ? { id: id as BrowserChoice["id"], profile } : { id: id as BrowserChoice["id"] };
}

function sameText(a: string | null, b: string | null) {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

function isDescribed(conn: { organization: string | null; environment: string | null }) {
  return conn.organization !== null && conn.environment !== null;
}

/**
 * Reads one persisted connection, from either the current shape or the shape
 * from before ids. Returns null for entries that cannot be used.
 */
function readPersistedConnection(
  raw: unknown,
  createId: () => string,
): PersistedConnection | null {
  if (!isRecord(raw)) return null;
  const envUrl = optionalString(raw.envUrl);
  if (!envUrl) return null;

  const organization = cleanText(raw.organization);
  const environment = cleanText(raw.environment);
  const legacyName = cleanText(raw.legacyName) ?? cleanText(raw.name);
  const meta = {
    id: optionalString(raw.id) ?? createId(),
    organization,
    environment,
    browser: cleanBrowser(raw.browser),
    ...(legacyName && !(organization && environment) ? { legacyName } : {}),
  };

  if (raw.crmType === "onpremise") {
    return {
      ...meta,
      crmType: "onpremise",
      envUrl,
      authMode: raw.authMode === "ifd" ? "ifd" : "ad",
      username: optionalString(raw.username) ?? "",
      domain: optionalString(raw.domain) ?? "",
      encryptedPassword: optionalString(raw.encryptedPassword) ?? "",
      ...(raw.needsPassword === true ? { needsPassword: true } : {}),
    };
  }
  return {
    ...meta,
    crmType: "online",
    envUrl,
    homeAccountId: optionalString(raw.homeAccountId),
  };
}

/**
 * Brings connections.json up to date: gives every connection an id, moves the
 * old free-text `name` to `legacyName`, and points the active connection at an id.
 */
export function migrateState(
  raw: RawPersistedState,
  createId: () => string = randomUUID,
): { state: PersistedState; changed: boolean } {
  const connections: PersistedConnection[] = [];
  const nameToId = new Map<string, string>();
  const seenIds = new Set<string>();
  let changed = false;

  for (const entry of raw.connections) {
    const conn = readPersistedConnection(entry, createId);
    if (!conn) {
      changed = true;
      continue;
    }
    if (seenIds.has(conn.id)) {
      conn.id = createId();
    }
    seenIds.add(conn.id);
    if (!isRecord(entry) || entry.id !== conn.id || "name" in entry) changed = true;
    if (isRecord(entry) && typeof entry.name === "string") nameToId.set(entry.name, conn.id);
    connections.push(conn);
  }

  let activeConnectionId: string | null = null;
  if (raw.activeConnectionId && seenIds.has(raw.activeConnectionId)) {
    activeConnectionId = raw.activeConnectionId;
  } else if (raw.activeConnectionName && nameToId.has(raw.activeConnectionName)) {
    activeConnectionId = nameToId.get(raw.activeConnectionName) ?? null;
    changed = true;
  }
  if ((raw.activeConnectionId ?? null) !== activeConnectionId) changed = true;

  return { state: { connections, activeConnectionId }, changed };
}

function toPersisted(conn: StoredConnection): PersistedConnection {
  if (conn.crmType === "online") {
    // The MSAL account stays in the MSAL cache; only its id is saved.
    const persisted: Partial<typeof conn> = { ...conn };
    delete persisted.account;
    return persisted as PersistedConnection;
  }
  return { ...conn };
}

function fromPersisted(conn: PersistedConnection): StoredConnection {
  return conn.crmType === "online" ? { ...conn, account: null } : { ...conn };
}

export function toConnectionSummary(conn: StoredConnection): ConnectionSummary {
  return {
    id: conn.id,
    organization: conn.organization,
    environment: conn.environment,
    legacyName: conn.legacyName ?? null,
    browser: conn.browser,
    envUrl: conn.envUrl,
    crmType: conn.crmType,
    needsPassword: conn.crmType === "onpremise" && conn.needsPassword === true,
  };
}

export interface ConnectionStoreOptions {
  initial: RawPersistedState;
  save: (state: PersistedState) => void;
  createId?: () => string;
}

export function createConnectionStore({
  initial,
  save,
  createId = randomUUID,
}: ConnectionStoreOptions) {
  const migrated = migrateState(initial, createId);
  // Insertion order is the order the user added connections.
  const connections = new Map<string, StoredConnection>(
    migrated.state.connections.map((conn) => [conn.id, fromPersisted(conn)]),
  );
  let activeId = migrated.state.activeConnectionId;

  function persist() {
    save({
      connections: [...connections.values()].map(toPersisted),
      activeConnectionId: activeId,
    });
  }

  if (migrated.changed) persist();

  /** The connection that already uses this organization + environment, if any. */
  function findClash(
    organization: string | null,
    environment: string | null,
    exceptId?: string,
  ): StoredConnection | null {
    if (organization === null || environment === null) return null;
    for (const conn of connections.values()) {
      if (conn.id === exceptId) continue;
      if (sameText(conn.organization, organization) && sameText(conn.environment, environment)) {
        return conn;
      }
    }
    return null;
  }

  function clashError(organization: string, environment: string) {
    return `${organization} already has an environment named "${environment}".`;
  }

  function applyDescription<C extends StoredConnection>(conn: C, patch: DescriptionPatch): C {
    const next: C = { ...conn };
    if ("organization" in patch) next.organization = cleanText(patch.organization);
    if ("environment" in patch) next.environment = cleanText(patch.environment);
    if ("browser" in patch) next.browser = cleanBrowser(patch.browser);
    if (isDescribed(next)) delete next.legacyName;
    return next;
  }

  return {
    list(): StoredConnection[] {
      return [...connections.values()];
    },

    summaries(): ConnectionSummary[] {
      return [...connections.values()].map(toConnectionSummary);
    },

    get(id: string): StoredConnection | null {
      return connections.get(id) ?? null;
    },

    get activeId(): string | null {
      return activeId;
    },

    findClash,

    /** Adds a connection. The first connection becomes active. */
    add(input: NewConnection): StoreResult<StoredConnection> {
      const id = input.id && !connections.has(input.id) ? input.id : createId();
      const conn = applyDescription({ ...input, id } as StoredConnection, {
        organization: input.organization,
        environment: input.environment,
        browser: input.browser,
      });
      const clash = findClash(conn.organization, conn.environment);
      if (clash && conn.organization && conn.environment) {
        return { success: false, error: clashError(conn.organization, conn.environment) };
      }
      connections.set(id, conn);
      if (activeId === null) activeId = id;
      persist();
      return { success: true, value: conn };
    },

    /** Changes what the user describes about a connection. The id never changes. */
    describe(id: string, patch: DescriptionPatch): StoreResult<StoredConnection> {
      const conn = connections.get(id);
      if (!conn) return { success: false, error: "Connection not found." };
      const next = applyDescription(conn, patch);
      if (next.organization === null || next.environment === null) {
        if (!next.legacyName) {
          return { success: false, error: "Enter an organization and an environment." };
        }
      }
      if (findClash(next.organization, next.environment, id) && next.organization && next.environment) {
        return { success: false, error: clashError(next.organization, next.environment) };
      }
      connections.set(id, next);
      persist();
      return { success: true, value: next };
    },

    /** Replaces stored fields that are not part of the description, such as a refreshed account. */
    replace(conn: StoredConnection) {
      if (!connections.has(conn.id)) return;
      connections.set(conn.id, conn);
      persist();
    },

    setActive(id: string): boolean {
      if (!connections.has(id)) return false;
      activeId = id;
      persist();
      return true;
    },

    /** Removes a connection. If it was active, the first remaining one becomes active. */
    remove(id: string): StoredConnection | null {
      const conn = connections.get(id);
      if (!conn) return null;
      connections.delete(id);
      if (activeId === id) {
        activeId = connections.keys().next().value ?? null;
      }
      persist();
      return conn;
    },
  };
}

export type ConnectionStore = ReturnType<typeof createConnectionStore>;
