// Serves each community tool's files from its own pt-tool://<tool-id> origin with a strict policy.
// Electron does not enforce CORS on protocol.handle responses, so the Content Security Policy
// is what keeps one tool from reading another tool's files or reaching the local sidecar.
import { protocol } from "electron";
import { extname, resolve, sep } from "node:path";
import type { CommunityToolManifest } from "./manifest.js";

export const TOOL_SCHEME = "pt-tool";

export interface ToolProtocolDeps {
  /** True when the user has reviewed this tool's permissions. An unreviewed tool is never served. */
  isConsented(id: string): boolean;
  folderFor(id: string): string | null;
  manifestFor(id: string): CommunityToolManifest | null;
  readFile(path: string): Promise<Buffer>;
  /** Resolves symlinks; rejects when the path does not exist. */
  realpath(path: string): Promise<string>;
}

export interface ToolResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer | null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

// Never add the bare `pt-tool:` scheme here: it would let a tool load or fetch another tool's files.
export function toolPolicy(manifest: Pick<CommunityToolManifest, "network">): string {
  const connect = manifest.network.length === 0 ? "'none'" : manifest.network.map((host) => `https://${host}`).join(" ");
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join("; ");
}

function failure(status: number): ToolResponse {
  return { status, headers: { "X-Content-Type-Options": "nosniff" }, body: null };
}

const comparable = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);

/** True when `file` is strictly inside `folder`. Case-insensitive on Windows. */
function isInside(folder: string, file: string): boolean {
  const base = comparable(folder.endsWith(sep) ? folder : folder + sep);
  return comparable(file).startsWith(base);
}

/** Splits `pt-tool://<id><path>` by hand: the WHATWG parser would fold `..` away before we can refuse it. */
function parseToolUrl(url: string): { id: string; rawPath: string } | null {
  const match = /^pt-tool:\/\/([^/?#]*)([^?#]*)/i.exec(url);
  return match ? { id: match[1].toLowerCase(), rawPath: match[2] } : null;
}

export async function resolveToolRequest(url: string, deps: ToolProtocolDeps): Promise<ToolResponse> {
  const parsed = parseToolUrl(url);
  if (!parsed) return failure(404);

  if (!deps.isConsented(parsed.id)) return failure(404);

  const folder = deps.folderFor(parsed.id);
  const manifest = deps.manifestFor(parsed.id);
  if (!folder || !manifest) return failure(404);

  let path: string;
  try {
    path = decodeURIComponent(parsed.rawPath);
  } catch {
    return failure(403);
  }
  if (path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) return failure(403);

  const relativePath = path.replace(/^\/+/, "") || manifest.entry;
  const filePath = resolve(folder, relativePath);
  if (!isInside(folder, filePath)) return failure(403);

  let realFolder: string;
  let realFile: string;
  try {
    realFolder = await deps.realpath(folder);
    realFile = await deps.realpath(filePath);
  } catch {
    return failure(404);
  }
  if (!isInside(realFolder, realFile)) return failure(403);

  let body: Buffer;
  try {
    body = await deps.readFile(realFile);
  } catch {
    return failure(404);
  }

  return {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Security-Policy": toolPolicy(manifest),
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
    body,
  };
}

/** Must run before the app's `ready` event. */
export function registerToolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: TOOL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

/**
 * Serves pt-tool:// requests. `ready` settles once the tool store has loaded the remembered
 * folders, so a tool opened right after start-up is found.
 */
export function installToolProtocol(deps: ToolProtocolDeps & { ready: Promise<unknown> }): void {
  // A failed load leaves the store empty; requests then get 404 instead of hanging.
  const loaded = deps.ready.catch(() => undefined);
  protocol.handle(TOOL_SCHEME, async (request) => {
    await loaded;
    const { status, headers, body } = await resolveToolRequest(request.url, deps);
    return new Response(body === null ? null : new Uint8Array(body), { status, headers });
  });
}
