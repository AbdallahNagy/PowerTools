// Validation of a community tool's powertools-tool.json manifest.
// Pure module with no Electron imports, so it stays unit-testable.

export interface CommunityToolManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  description: string;
  version: string;
  publisher: { name: string; url?: string };
  icon: string;
  entry: string;
  minHostVersion: string;
  permissions: string[];
  messages: string[];
  network: string[];
  allowMultipleInstances: boolean;
}

export type ManifestResult = { ok: true; manifest: CommunityToolManifest } | { ok: false; errors: string[] };

/** Kept equal to PERMISSIONS in packages/sdk/src/protocol.ts; a test enforces it. */
export const MANIFEST_PERMISSIONS: readonly string[] = [
  "data:read",
  "data:write",
  "data:delete",
  "metadata:read",
  "metadata:write",
  "files",
];

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const HOST_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;
const MESSAGE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HOST_LABEL = "[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?";
const HOST_PATTERN = new RegExp(`^${HOST_LABEL}(\\.${HOST_LABEL})*$`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVersion(text: string, pattern: RegExp): [number, number, number] | null {
  const match = pattern.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** A path inside the package: relative, forward slashes only, no `..` segment, no scheme or drive. */
function isPackagePath(path: string): boolean {
  if (path.length === 0 || path.includes("\\") || path.includes(":") || path.startsWith("/")) return false;
  return !path.split("/").includes("..");
}

export function parseManifest(json: unknown, hostVersion: string): ManifestResult {
  if (!isRecord(json)) return { ok: false, errors: ["manifest: must be a JSON object"] };

  const errors: string[] = [];

  const requiredString = (field: string): string => {
    const value = json[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${field}: must be a non-empty string`);
      return "";
    }
    return value;
  };

  const stringList = (field: string, check: (entry: string) => boolean, rule: string): string[] => {
    const value = json[field];
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      errors.push(`${field}: must be an array of strings`);
      return [];
    }
    const invalid = value.filter((entry) => !check(entry));
    if (invalid.length > 0) errors.push(`${field}: ${invalid.map((entry) => JSON.stringify(entry)).join(", ")} ${rule}`);
    return value;
  };

  if (json.manifestVersion !== 1) errors.push("manifestVersion: must be 1");

  const id = requiredString("id");
  if (id && !ID_PATTERN.test(id)) errors.push(`id: "${id}" must be publisher.tool-name in lowercase kebab segments`);

  const name = requiredString("name");
  const description = requiredString("description");

  const version = requiredString("version");
  if (version && !parseVersion(version, VERSION_PATTERN)) errors.push(`version: "${version}" must be x.y.z`);

  let publisher: CommunityToolManifest["publisher"] = { name: "" };
  if (!isRecord(json.publisher)) {
    errors.push("publisher: must be an object");
  } else {
    const { name: publisherName, url } = json.publisher;
    if (typeof publisherName !== "string" || publisherName.trim().length === 0) {
      errors.push("publisher.name: must be a non-empty string");
    } else {
      publisher = { name: publisherName };
    }
    if (url !== undefined) {
      if (typeof url !== "string") errors.push("publisher.url: must be a string");
      else publisher = { ...publisher, url };
    }
  }

  const icon = requiredString("icon");
  if (icon) {
    if (!icon.endsWith(".svg")) errors.push(`icon: "${icon}" must be an .svg file`);
    else if (!isPackagePath(icon)) errors.push(`icon: "${icon}" must be a relative path inside the package`);
  }

  const entry = requiredString("entry");
  if (entry && !isPackagePath(entry)) errors.push(`entry: "${entry}" must be a relative path inside the package`);

  const minHostVersion = requiredString("minHostVersion");
  if (minHostVersion) {
    const required = parseVersion(minHostVersion, VERSION_PATTERN);
    const host = parseVersion(hostVersion, HOST_VERSION_PATTERN);
    if (!required) errors.push(`minHostVersion: "${minHostVersion}" must be x.y.z`);
    else if (!host || compareVersions(required, host) > 0) {
      errors.push(`minHostVersion: needs Power Tools ${minHostVersion} or later; this is ${hostVersion}`);
    }
  }

  const permissions = stringList("permissions", (p) => MANIFEST_PERMISSIONS.includes(p), "is not a known permission");
  const messages = stringList("messages", (m) => MESSAGE_PATTERN.test(m), "is not a valid message name");
  const network = stringList("network", (h) => HOST_PATTERN.test(h), "must be a bare host name");

  let allowMultipleInstances = true;
  if (json.allowMultipleInstances !== undefined) {
    if (typeof json.allowMultipleInstances !== "boolean") errors.push("allowMultipleInstances: must be a boolean");
    else allowMultipleInstances = json.allowMultipleInstances;
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    manifest: {
      manifestVersion: 1,
      id,
      name,
      description,
      version,
      publisher,
      icon,
      entry,
      minHostVersion,
      permissions,
      messages,
      network,
      allowMultipleInstances,
    },
  };
}
