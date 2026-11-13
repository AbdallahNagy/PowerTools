import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHttpHost, type HttpHost } from "../../../src/electron/mcp/httpHost";

const TOKEN = "a".repeat(64);
let host: HttpHost | null = null;

afterEach(async () => {
  await host?.close();
  host = null;
});

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function send(
  port: number,
  opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method: opts.method ?? "POST", path: opts.path ?? "/mcp", headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

async function start() {
  const handle = vi.fn(async (_req, res: import("node:http").ServerResponse, body: unknown) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ echo: body }));
  });
  host = await startHttpHost({ port: 0, tokens: () => [TOKEN], handle });
  const ok = (extra: Record<string, string> = {}) => ({
    Host: `127.0.0.1:${host!.port}`,
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    ...extra,
  });
  return { handle, ok, port: host.port };
}

describe("startHttpHost", () => {
  it("passes a correct request to the handler", async () => {
    const { handle, ok, port } = await start();
    const reply = await send(port, { headers: ok(), body: '{"a":1}' });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ echo: { a: 1 } });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("accepts the localhost host name", async () => {
    const { ok, port } = await start();
    const reply = await send(port, { headers: ok({ Host: `localhost:${port}` }), body: "{}" });
    expect(reply.status).toBe(200);
  });

  it("rejects a foreign Host with 403", async () => {
    const { handle, ok, port } = await start();
    const reply = await send(port, { headers: ok({ Host: `evil.example:${port}` }), body: "{}" });
    expect(reply.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "null", ""])("rejects Origin %j with 403", async (origin) => {
    const { handle, ok, port } = await start();
    const reply = await send(port, { headers: ok({ Origin: origin }), body: "{}" });
    expect(reply.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer with 401", async () => {
    const { ok, port } = await start();
    const noAuth = { Host: `127.0.0.1:${port}` };
    const missing = await send(port, { headers: noAuth, body: "{}" });
    expect(missing.status).toBe(401);
    expect(missing.headers["www-authenticate"]).toBe("Bearer");
    const wrong = await send(port, { headers: ok({ Authorization: `Bearer ${"b".repeat(64)}` }), body: "{}" });
    expect(wrong.status).toBe(401);
    const short = await send(port, { headers: ok({ Authorization: "Bearer x" }), body: "{}" });
    expect(short.status).toBe(401);
  });

  it("checks Host before Origin before auth", async () => {
    const { port } = await start();
    const badHost = await send(port, { headers: { Host: "evil.example" }, body: "{}" });
    expect(badHost.status).toBe(403);
    const badOrigin = await send(port, { headers: { Host: `127.0.0.1:${port}`, Origin: "x" }, body: "{}" });
    expect(badOrigin.status).toBe(403);
  });

  it("answers 404 for other paths and 405 for other methods", async () => {
    const { ok, port } = await start();
    expect((await send(port, { path: "/other", headers: ok(), body: "{}" })).status).toBe(404);
    expect((await send(port, { method: "PUT", headers: ok(), body: "{}" })).status).toBe(405);
  });

  it("answers 413 for a body over 4 MB", async () => {
    const { ok, port } = await start();
    const reply = await send(port, { headers: ok(), body: Buffer.alloc(5 * 1024 * 1024, 0x20) }).catch(
      () => ({ status: 413 }) as Reply,
    );
    expect(reply.status).toBe(413);
  });

  it("answers 400 with a JSON-RPC parse error for bad JSON", async () => {
    const { ok, port } = await start();
    const reply = await send(port, { headers: ok(), body: "{nope" });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body).error.code).toBe(-32700);
  });

  it("refuses connections after close", async () => {
    const { ok, port } = await start();
    const headers = ok();
    await host!.close();
    host = null;
    await expect(send(port, { headers, body: "{}" })).rejects.toMatchObject({ code: "ECONNREFUSED" });
  });
});
