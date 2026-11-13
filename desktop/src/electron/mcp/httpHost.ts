import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface HttpHostOptions {
  port: number;
  /** Bearer tokens that are currently valid. */
  tokens: () => string[];
  handle: (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void>;
}

export interface HttpHost {
  port: number;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function tokenMatches(presented: string, tokens: string[]): boolean {
  const a = Buffer.from(presented, "utf8");
  let ok = false;
  for (const token of tokens) {
    const b = Buffer.from(token, "utf8");
    // timingSafeEqual needs equal lengths; a length mismatch simply fails.
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1] : null;
}

/** Reads a JSON body of at most MAX_BODY_BYTES. Returns the parsed value, or the status to answer with. */
function readJson(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  return new Promise((resolve) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      resolve({ ok: false, status: 413 });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        resolve({ ok: false, status: 413 });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch {
        resolve({ ok: false, status: 400 });
      }
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      resolve({ ok: false, status: 400 });
    });
  });
}

export function startHttpHost(opts: HttpHostOptions): Promise<HttpHost> {
  const sockets = new Set<Socket>();
  let boundPort = 0;

  const server = createServer((req, res) => {
    void (async () => {
      // 1. Host: stops DNS rebinding.
      const host = req.headers.host;
      if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) {
        sendJson(res, 403, { error: "Forbidden host" });
        return;
      }
      // 2. Any Origin means a browser page is calling.
      if (req.headers.origin !== undefined) {
        sendJson(res, 403, { error: "Forbidden origin" });
        return;
      }
      // 3. Bearer token.
      const presented = bearerOf(req);
      if (presented === null || !tokenMatches(presented, opts.tokens())) {
        sendJson(res, 401, { error: "Unauthorized" }, { "WWW-Authenticate": "Bearer" });
        return;
      }

      const path = (req.url ?? "").split("?")[0];
      if (path !== "/mcp") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
        sendJson(res, 405, { error: "Method not allowed" }, { Allow: "POST, GET, DELETE" });
        return;
      }

      let body: unknown;
      if (req.method === "POST") {
        const parsed = await readJson(req);
        if (!parsed.ok) {
          if (parsed.status === 413) {
            sendJson(res, 413, { error: "Request body too large" }, { Connection: "close" });
            return;
          }
          sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
          return;
        }
        body = parsed.value;
      }

      try {
        await opts.handle(req, res, body);
      } catch {
        sendJson(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
      }
    })();
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      server.off("error", reject);
      boundPort = (server.address() as { port: number }).port;
      resolve({
        port: boundPort,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            for (const socket of sockets) socket.destroy();
          }),
      });
    });
  });
}
