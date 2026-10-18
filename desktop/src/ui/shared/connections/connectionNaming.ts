import type { ConnectionInfo, ConnectionSummary, EnvironmentKind } from "./types";

/** Environment names offered as one-click choices, in the order they are listed. */
export const ENVIRONMENT_PRESETS = ["dev", "qc", "stg", "prod"] as const;

const KIND_ORDER: readonly EnvironmentKind[] = ["dev", "test", "uat", "staging", "production", "other"];

const KIND_WORDS: ReadonlyArray<[EnvironmentKind, readonly string[]]> = [
  ["dev", ["dev", "develop", "development"]],
  ["test", ["test", "testing", "qa", "qc", "sit"]],
  ["uat", ["uat"]],
  ["staging", ["stg", "stage", "staging", "preprod", "preproduction"]],
  ["production", ["prod", "production", "prd", "live"]],
];

/** Reads the kind of an environment from its first word: "dev 2" is dev, "qc team a" is test. */
export function environmentKind(environment: string | null): EnvironmentKind {
  const firstWord = environment?.trim().toLowerCase().split(/\s+/)[0] ?? "";
  // "Pre-Prod" reads as one word; "Dev-Integration" reads by its first part.
  const candidates = [firstWord.replace(/[-_.]/g, ""), firstWord.split(/[-_.:/(]/)[0]];
  for (const [kind, words] of KIND_WORDS) {
    if (candidates.some((candidate) => words.includes(candidate))) return kind;
  }
  return "other";
}

export function connectionDisplayName(
  connection: Pick<ConnectionSummary, "organization" | "environment" | "legacyName" | "envUrl">,
): string {
  if (connection.organization && connection.environment) {
    return `${connection.organization} · ${connection.environment}`;
  }
  return connection.legacyName ?? environmentHost(connection.envUrl);
}

export function toConnectionInfo(summary: ConnectionSummary): ConnectionInfo {
  return {
    ...summary,
    displayName: connectionDisplayName(summary),
    environmentKind: environmentKind(summary.environment),
    isUngrouped: !(summary.organization && summary.environment),
  };
}

function environmentHost(envUrl: string): string {
  try {
    return new URL(envUrl).hostname;
  } catch {
    return envUrl;
  }
}

/** The first label of the environment host: "contoso-dev" for contoso-dev.crm4.dynamics.com. */
export function suggestOrganization(envUrl: string): string | null {
  const host = environmentHost(envUrl);
  const label = host.split(".")[0];
  return label && label !== host ? label : null;
}

function sameText(a: string | null, b: string | null) {
  return a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The connection that already uses this organization + environment, if any. */
export function findEnvironmentClash<T extends Pick<ConnectionSummary, "id" | "organization" | "environment">>(
  connections: readonly T[],
  organization: string | null,
  environment: string | null,
  exceptId?: string,
): T | null {
  if (!organization?.trim() || !environment?.trim()) return null;
  return connections.find(
    (connection) =>
      connection.id !== exceptId &&
      sameText(connection.organization, organization) &&
      sameText(connection.environment, environment),
  ) ?? null;
}

/**
 * The environment name to fill in when the user picks `preset`: the preset itself,
 * or "dev 2", "dev 3"… when the organization already has it.
 */
export function nextFreeEnvironment(
  connections: readonly Pick<ConnectionSummary, "id" | "organization" | "environment">[],
  organization: string | null,
  preset: string,
  exceptId?: string,
): string {
  if (!findEnvironmentClash(connections, organization, preset, exceptId)) return preset;
  for (let n = 2; ; n += 1) {
    const candidate = `${preset} ${n}`;
    if (!findEnvironmentClash(connections, organization, candidate, exceptId)) return candidate;
  }
}

export interface ConnectionGroup {
  /** Organization name, or null for connections not described yet ("Other"). */
  organization: string | null;
  label: string;
  connections: ConnectionInfo[];
}

export const UNGROUPED_LABEL = "Other";

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/**
 * Groups connections by organization, A to Z, with "Other" last. Inside an
 * organization, environments run Dev → Test → UAT → Staging → Production → others.
 */
export function groupConnections(connections: readonly ConnectionInfo[]): ConnectionGroup[] {
  const groups = new Map<string, ConnectionGroup>();
  const ungrouped: ConnectionInfo[] = [];

  for (const connection of connections) {
    if (connection.isUngrouped || !connection.organization) {
      ungrouped.push(connection);
      continue;
    }
    const key = connection.organization.toLowerCase();
    const group = groups.get(key) ?? { organization: connection.organization, label: connection.organization, connections: [] };
    group.connections.push(connection);
    groups.set(key, group);
  }

  const sorted = [...groups.values()].sort((a, b) => compareText(a.label, b.label));
  for (const group of sorted) {
    group.connections.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.environmentKind) - KIND_ORDER.indexOf(b.environmentKind) ||
        compareText(a.environment ?? "", b.environment ?? ""),
    );
  }
  if (ungrouped.length > 0) {
    sorted.push({ organization: null, label: UNGROUPED_LABEL, connections: ungrouped });
  }
  return sorted;
}

/** Organization names in use, for suggestions. */
export function knownOrganizations(connections: readonly ConnectionSummary[]): string[] {
  const seen = new Map<string, string>();
  for (const connection of connections) {
    if (connection.organization) seen.set(connection.organization.toLowerCase(), connection.organization);
  }
  return [...seen.values()].sort(compareText);
}
