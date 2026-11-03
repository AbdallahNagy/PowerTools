// PROTOTYPE (wayfinder spike, issue #101). Throwaway: never merge to main.
// Serves a local community tool bundle on pt-tool://<id>/ and gives each tab a
// MessagePort Host API whose one call sends a Dataverse Web API request with
// the tab's connection. The main process holds the token; the tool never sees it.
import { join, normalize, sep } from "path";
import { readFile } from "fs/promises";
import { app, BrowserWindow, ipcMain, MessageChannelMain, net, protocol, type WebFrameMain } from "electron";

export const TOOL_SCHEME = "pt-tool";

// Must run before app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: TOOL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

function toolCsp(toolId: string, sameOrigin: boolean) {
  const self = `${TOOL_SCHEME}://${toolId}`;
  return [
    "default-src 'none'",
    `script-src 'self' ${self}`,
    `worker-src 'self' ${self} blob:`,
    `style-src 'self' ${self} 'unsafe-inline'`,
    "img-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    sameOrigin ? "sandbox allow-scripts allow-same-origin" : "sandbox allow-scripts",
  ].join("; ");
}

type ConnectionResult =
  | { id: string; envUrl: string; crmType: "online" | "onpremise"; token?: string }
  | { error: string };

export function registerPrototypeCommunityTools(deps: {
  getMainWindow: () => BrowserWindow | null;
  getConnection: (id: string) => Promise<ConnectionResult>;
}) {
  const root = join(app.getAppPath(), "prototype-community-tools");

  protocol.handle(TOOL_SCHEME, async (request) => {
    const url = new URL(request.url);
    const toolId = url.hostname;
    const file = normalize(join(root, toolId, decodeURIComponent(url.pathname)));
    if (!file.startsWith(join(root, toolId) + sep)) return new Response("Forbidden", { status: 403 });
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf("."));
      return new Response(body, {
        headers: {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          // Spike toggle: ?so=1 lets the CSP sandbox keep the tool origin.
          "Content-Security-Policy": toolCsp(toolId, url.searchParams.has("so")),
          // Lets the opaque-origin frame fetch its own worker script for a blob: worker.
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  ipcMain.handle("prototype-tool-open", (event, args: { toolId: string; instanceId: string; connectionId: string | null }) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error("Only the shell frame may open a tool port.");
    }
    const { port1, port2 } = new MessageChannelMain();
    port1.on("message", async ({ data }) => {
      const { id, method, path } = data as { id: number; method: string; path: string };
      const log = { toolId: args.toolId, instanceId: args.instanceId, connectionId: args.connectionId, method, path };
      try {
        if (!args.connectionId) throw new Error("This tab has no connection.");
        if (method !== "GET") throw new Error("Spike Host API allows GET only.");
        const conn = await deps.getConnection(args.connectionId);
        if ("error" in conn) throw new Error(conn.error);
        if (conn.crmType !== "online" || !conn.token) throw new Error("Spike supports online connections only.");
        const target = new URL(`/api/data/v9.2/${path.replace(/^\/+/, "")}`, conn.envUrl);
        const res = await net.fetch(target.toString(), {
          headers: { Authorization: `Bearer ${conn.token}`, Accept: "application/json", "OData-Version": "4.0" },
        });
        const text = await res.text();
        console.log("[prototype-tool] host api", log, res.status);
        port1.postMessage({ id, ok: res.ok, status: res.status, body: safeJson(text) });
      } catch (err) {
        console.log("[prototype-tool] host api error", log, (err as Error).message);
        port1.postMessage({ id, ok: false, error: (err as Error).message });
      }
    });
    port1.start();
    event.sender.postMessage("prototype-tool-port", { instanceId: args.instanceId }, [port2]);
    return true;
  });

  ipcMain.handle("prototype-tool-frames", () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return [];
    const main = mainWindow.webContents.mainFrame;
    return main.framesInSubtree.map((f: WebFrameMain) => ({
      url: f.url,
      origin: f.origin,
      osProcessId: f.osProcessId,
      isShell: f === main,
    }));
  });
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
