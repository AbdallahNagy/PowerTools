import { formatXml, readPrimaryEntityName, XmlFormatError } from "./formatXml";
import type { SavedQuery } from "./types";

export const QUERY_LIBRARY_STORAGE_KEY = "powertools.fetchxml-tester.queries";
export const QUERY_LIBRARY_CHANGED_EVENT = "powertools:fetchxml-tester-library-changed";

export interface QueryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveQueryInput {
  fetchXml: string;
  description: string;
  connectionId: string;
  environment: string;
}

export type SaveQueryResult =
  | { ok: true; queries: SavedQuery[] }
  | { ok: false; error: string };

export function loadQueries(store: QueryStore): SavedQuery[] {
  const raw = store.getItem(QUERY_LIBRARY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readLegacyQuery).filter(isSavedQuery).sort(byNewest);
  } catch {
    return [];
  }
}

export function writeQueries(store: QueryStore, queries: readonly SavedQuery[]): void {
  store.setItem(QUERY_LIBRARY_STORAGE_KEY, JSON.stringify(queries));
}

export function saveQuery(
  existing: readonly SavedQuery[],
  input: SaveQueryInput,
  options: { id?: string; savedAt?: string } = {},
): SaveQueryResult {
  let formatted: string;
  try {
    formatted = formatXml(input.fetchXml);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof XmlFormatError ? error.message : "Please check the input XML.",
    };
  }

  const table = readPrimaryEntityName(formatted);
  if (!table) {
    return { ok: false, error: "FetchXML must include an <entity> name before it can be saved." };
  }

  const next: SavedQuery = {
    id: options.id ?? crypto.randomUUID(),
    table,
    description: input.description.trim(),
    environment: input.environment,
    connectionId: input.connectionId,
    fetchXml: formatted,
    savedAt: options.savedAt ?? new Date().toISOString(),
  };
  const duplicateIndex = existing.findIndex(
    (query) => normalizeFetchXml(query.fetchXml) === formatted,
  );
  const queries = [...existing];
  if (duplicateIndex >= 0) {
    const current = queries[duplicateIndex];
    if (current) queries[duplicateIndex] = { ...next, id: current.id };
  } else {
    queries.push(next);
  }

  return { ok: true, queries: queries.sort(byNewest) };
}

export function deleteQuery(existing: readonly SavedQuery[], id: string): SavedQuery[] {
  return existing.filter((query) => query.id !== id);
}

export function filterQueries(
  queries: readonly SavedQuery[],
  options: {
    connectionId: string;
    /** Name the connection had before ids; queries saved back then carry it. */
    legacyName?: string | null;
    allEnvironments: boolean;
    search: string;
  },
): SavedQuery[] {
  const search = options.search.trim().toLowerCase();
  const connectionKeys = [options.connectionId, options.legacyName].filter(Boolean);
  return queries.filter((query) => {
    if (!options.allEnvironments && !connectionKeys.includes(query.connectionId)) return false;
    if (!search) return true;
    return [query.table, query.description, query.fetchXml, query.environment]
      .join("\n")
      .toLowerCase()
      .includes(search);
  });
}

function normalizeFetchXml(fetchXml: string): string {
  try {
    return formatXml(fetchXml);
  } catch {
    return fetchXml.trim();
  }
}

function byNewest(left: SavedQuery, right: SavedQuery): number {
  return right.savedAt.localeCompare(left.savedAt);
}

/** Queries saved before connections had ids stored the connection name as `connectionName`. */
function readLegacyQuery(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.connectionId === "string" || typeof record.connectionName !== "string") return value;
  const { connectionName, ...rest } = record;
  return { ...rest, connectionId: connectionName };
}

function isSavedQuery(value: unknown): value is SavedQuery {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.table === "string"
    && typeof record.description === "string"
    && typeof record.environment === "string"
    && typeof record.connectionId === "string"
    && typeof record.fetchXml === "string"
    && typeof record.savedAt === "string";
}
