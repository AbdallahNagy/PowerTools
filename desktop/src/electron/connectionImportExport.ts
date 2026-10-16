import { randomUUID } from "crypto";
import { cleanBrowser, cleanText, type ConnectionStore } from "./connectionStore.js";
import type { BrowserChoice, StoredConnection } from "./connectionTypes.js";

export const EXPORT_FORMAT = "powertools-connections";
export const EXPORT_VERSION = 1;

/** One connection in a Power Tools export file. Never holds passwords or tokens. */
export interface ExportedConnection {
  id: string;
  organization: string | null;
  environment: string | null;
  legacyName?: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  authMode?: "ad" | "ifd";
  username?: string;
  domain?: string;
  browser: BrowserChoice | null;
}

export type ImportStatus = "new" | "duplicate" | "ungrouped" | "unsupported";

/** A connection read from a file, before the user picks what to import. */
export interface ImportEntry {
  key: string;
  /** Id from a Power Tools export, kept when it is free so re-imports do not duplicate. */
  id?: string;
  organization: string | null;
  environment: string | null;
  legacyName: string | null;
  envUrl: string;
  crmType: "online" | "onpremise";
  authMode: "ad" | "ifd";
  username: string;
  domain: string;
  browser: BrowserChoice | null;
  status: ImportStatus;
  reason?: string;
}

export interface ParsedImport {
  source: "powertools" | "xrmtoolbox";
  entries: ImportEntry[];
}

export function exportConnections(connections: readonly StoredConnection[]): string {
  const exported: ExportedConnection[] = connections.map((conn) => ({
    id: conn.id,
    organization: conn.organization,
    environment: conn.environment,
    ...(conn.legacyName ? { legacyName: conn.legacyName } : {}),
    envUrl: conn.envUrl,
    crmType: conn.crmType,
    ...(conn.crmType === "onpremise"
      ? { authMode: conn.authMode, username: conn.username, domain: conn.domain }
      : {}),
    browser: conn.browser,
  }));
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), connections: exported },
    null,
    2,
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    // Keep the organization path for on-premises servers; drop SDK endpoints and queries.
    const path = url.pathname.replace(/\/XRMServices\/.*$/i, "").replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return "";
  }
}

function parsePowerTools(json: unknown): ImportEntry[] {
  const connections = (json as { connections?: unknown }).connections;
  if (!Array.isArray(connections)) throw new Error("The file has no connections list.");
  return connections.map((raw, index): ImportEntry => {
    const item = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const crmType = item.crmType === "onpremise" ? "onpremise" : "online";
    const envUrl = normalizeUrl(text(item.envUrl));
    return {
      key: `p${index}`,
      id: text(item.id) || undefined,
      organization: cleanText(item.organization),
      environment: cleanText(item.environment),
      legacyName: cleanText(item.legacyName),
      envUrl,
      crmType,
      authMode: item.authMode === "ifd" ? "ifd" : "ad",
      username: text(item.username),
      domain: text(item.domain),
      browser: cleanBrowser(item.browser),
      status: envUrl ? "new" : "unsupported",
      ...(envUrl ? {} : { reason: "The file has no environment address for this connection." }),
    };
  });
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return XML_ENTITIES[entity] ?? match;
    });
}

/** Text of the first `<tag>` directly or deeply inside `xml`. Empty when missing. */
function xmlValue(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1]).trim() : "";
}

const UNSUPPORTED_AUTH: Record<string, string> = {
  ClientSecret: "Client secret sign-in is not supported yet.",
  Certificate: "Certificate sign-in is not supported yet.",
  ExternalTokenManagement: "External token sign-in is not supported.",
};

const XRMTOOLBOX_BROWSERS: Record<string, BrowserChoice["id"]> = {
  edge: "edge",
  chrome: "chrome",
  firefox: "firefox",
};

/** Reads an XrmToolBox connections file (`<CrmConnections>`) or one exported `<ConnectionDetail>`. */
export function parseXrmToolBox(xml: string): ImportEntry[] {
  const details = xml.match(/<ConnectionDetail(?:\s[^>]*)?>[\s\S]*?<\/ConnectionDetail>/g);
  if (!details) throw new Error("The file has no XrmToolBox connections.");

  return details.map((detail, index): ImportEntry => {
    const name = xmlValue(detail, "ConnectionName");
    const newAuth = xmlValue(detail, "NewAuthType");
    const legacyAuth = xmlValue(detail, "AuthType");
    const url = xmlValue(detail, "OriginalUrl") || xmlValue(detail, "WebApplicationUrl") || xmlValue(detail, "OrganizationServiceUrl");
    const envUrl = normalizeUrl(url);
    const host = (() => {
      try {
        return new URL(envUrl).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const online =
      xmlValue(detail, "UseOnline").toLowerCase() === "true" ||
      ["OAuth", "Office365"].includes(newAuth) ||
      ["OnlineFederation", "LiveId"].includes(legacyAuth) ||
      host.endsWith(".dynamics.com");
    const ifd =
      xmlValue(detail, "UseIfd").toLowerCase() === "true" ||
      ["IFD", "Claims"].includes(newAuth) ||
      legacyAuth === "Federation";
    const browserId = XRMTOOLBOX_BROWSERS[xmlValue(detail, "BrowserName").toLowerCase()];
    const profile = xmlValue(detail, "BrowserProfile");

    let status: ImportStatus = "new";
    let reason: string | undefined;
    if (UNSUPPORTED_AUTH[newAuth]) {
      status = "unsupported";
      reason = UNSUPPORTED_AUTH[newAuth];
    } else if (xmlValue(detail, "ConnectionString") && !envUrl) {
      status = "unsupported";
      reason = "Connection string connections are not supported.";
    } else if (!envUrl) {
      status = "unsupported";
      reason = "The file has no environment address for this connection.";
    }

    return {
      key: `x${index}`,
      organization: cleanText(xmlValue(detail, "OrganizationFriendlyName")),
      environment: cleanText(xmlValue(xmlValue(detail, "EnvironmentHighlightingInfo") || "", "Text") || xmlValue(detail, "EnvironmentText")),
      legacyName: cleanText(name),
      envUrl,
      crmType: online ? "online" : "onpremise",
      authMode: ifd ? "ifd" : "ad",
      username: xmlValue(detail, "UserName"),
      domain: xmlValue(detail, "UserDomain"),
      browser: browserId ? (profile ? { id: browserId, profile } : { id: browserId }) : null,
      status,
      ...(reason ? { reason } : {}),
    };
  });
}

/** Reads an import file by its content: Power Tools JSON or XrmToolBox XML. */
export function parseImportFile(content: string): ParsedImport {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error("The file is not valid JSON.");
    }
    if ((json as { format?: unknown }).format !== EXPORT_FORMAT) {
      throw new Error("The file is not a Power Tools connections export.");
    }
    return { source: "powertools", entries: parsePowerTools(json) };
  }
  if (trimmed.startsWith("<")) {
    return { source: "xrmtoolbox", entries: parseXrmToolBox(trimmed) };
  }
  throw new Error("Choose a Power Tools export (.json) or an XrmToolBox connections file (.xml).");
}

function sameConnection(entry: ImportEntry, conn: StoredConnection) {
  const sameUrl = normalizeUrl(conn.envUrl).toLowerCase() === entry.envUrl.toLowerCase();
  if (!sameUrl) return false;
  if (entry.crmType === "onpremise" && conn.crmType === "onpremise") {
    return conn.username.toLowerCase() === entry.username.toLowerCase();
  }
  return entry.crmType === conn.crmType;
}

/**
 * Marks what each entry would become: already added, under Other (no
 * organization + environment, or a name that is taken), or new.
 */
export function classifyImport(entries: readonly ImportEntry[], existing: readonly StoredConnection[]): ImportEntry[] {
  const taken = new Set(
    existing
      .filter((conn) => conn.organization && conn.environment)
      .map((conn) => `${conn.organization}\u0000${conn.environment}`.toLowerCase()),
  );
  const seen: ImportEntry[] = [];
  return entries.map((entry) => {
    if (entry.status === "unsupported") return entry;
    if (existing.some((conn) => sameConnection(entry, conn)) || seen.some((other) => other.envUrl.toLowerCase() === entry.envUrl.toLowerCase() && other.username.toLowerCase() === entry.username.toLowerCase())) {
      return { ...entry, status: "duplicate" as const, reason: "This environment is already in your connections." };
    }
    seen.push(entry);
    if (!entry.organization || !entry.environment) {
      return { ...entry, status: "ungrouped" as const, reason: "No organization or environment in the file. Add them after importing." };
    }
    const nameKey = `${entry.organization}\u0000${entry.environment}`.toLowerCase();
    if (taken.has(nameKey)) {
      return { ...entry, status: "ungrouped" as const, reason: `${entry.organization} already has "${entry.environment}". Rename it after importing.` };
    }
    taken.add(nameKey);
    return { ...entry, status: "new" as const };
  });
}

/** Adds the chosen entries to the store. Returns how many were added. */
export function commitImport(store: ConnectionStore, entries: readonly ImportEntry[], keys: readonly string[]): number {
  let imported = 0;
  for (const entry of entries) {
    if (!keys.includes(entry.key)) continue;
    if (entry.status !== "new" && entry.status !== "ungrouped") continue;

    const fallbackName = entry.legacyName ?? (entry.organization && entry.environment ? `${entry.organization} ${entry.environment}` : entry.envUrl);
    const described = entry.status === "new";
    const base = {
      id: entry.id ?? randomUUID(),
      organization: entry.organization,
      environment: described ? entry.environment : null,
      ...(described ? {} : { legacyName: fallbackName }),
      browser: entry.browser,
      envUrl: entry.envUrl,
    };
    const result = entry.crmType === "online"
      ? store.add({ ...base, crmType: "online", homeAccountId: null, account: null })
      : store.add({
          ...base,
          crmType: "onpremise",
          authMode: entry.authMode,
          username: entry.username,
          domain: entry.domain,
          encryptedPassword: "",
          needsPassword: true,
        });
    if (result.success) imported += 1;
  }
  return imported;
}
