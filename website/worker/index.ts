// Serves the static site and receives the desktop app's anonymous daily
// heartbeat. A heartbeat carries a random install ID, the app version and the
// OS. It never carries IP addresses, user names, or Dataverse data, and this
// worker does not record the request IP.

interface AnalyticsEngineDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  USAGE: AnalyticsEngineDataset;
}

export interface Heartbeat {
  installId: string;
  version: string;
  platform: string;
  arch: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,32})?$/;
const PLATFORMS = new Set(["win32", "darwin", "linux"]);
const ARCHES = new Set(["x64", "arm64", "ia32"]);
const MAX_BODY_CHARS = 512;

export function parseHeartbeat(value: unknown): Heartbeat | null {
  if (!value || typeof value !== "object") return null;
  const { installId, version, platform, arch } = value as Record<string, unknown>;
  if (typeof installId !== "string" || !UUID.test(installId)) return null;
  if (typeof version !== "string" || !VERSION.test(version)) return null;
  if (typeof platform !== "string" || !PLATFORMS.has(platform)) return null;
  if (typeof arch !== "string" || !ARCHES.has(arch)) return null;
  return { installId: installId.toLowerCase(), version, platform, arch };
}

async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_CHARS) {
    return new Response(null, { status: 413 });
  }

  let heartbeat: Heartbeat | null = null;
  try {
    heartbeat = parseHeartbeat(JSON.parse(body));
  } catch {
    heartbeat = null;
  }
  if (!heartbeat) {
    return new Response(null, { status: 400 });
  }

  env.USAGE.writeDataPoint({
    indexes: [heartbeat.installId],
    blobs: [heartbeat.version, heartbeat.platform, heartbeat.arch],
    doubles: [1],
  });
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/heartbeat") {
      return handleHeartbeat(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
