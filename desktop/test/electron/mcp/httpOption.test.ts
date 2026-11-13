import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpTokenStore, type SecretBox } from "../../../src/electron/mcp/httpToken";
import { createMcpService, DEFAULT_HTTP_PORT, type McpHttpSettings, type McpService } from "../../../src/electron/mcp/mcpService";
import { bypassMsw } from "../../support/loopback";

let dir: string;
let service: McpService | null = null;
const blockers: Server[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pt-mcp-http-"));
});

afterEach(async () => {
  await service?.stop();
  service = null;
  await Promise.all(blockers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
  await rm(dir, { recursive: true, force: true });
});

/** A stand-in for safeStorage: reversible, and not the plain token on disk. */
function fakeBox(available = true): SecretBox {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${Buffer.from(plain).toString("base64")}`),
    decryptString: (buffer) => Buffer.from(buffer.toString().replace(/^enc:/, ""), "base64").toString(),
  };
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function make(options: { http?: Partial<McpHttpSettings>; box?: SecretBox; clipboard?: { writeText(t: string): void } } = {}) {
  let http: McpHttpSettings = { enabled: false, port: DEFAULT_HTTP_PORT, ...options.http };
  const tokenPath = join(dir, "mcp-http-token.bin");
  const store = createHttpTokenStore(tokenPath, options.box ?? fakeBox());
  service = createMcpService({
    userDataPath: dir,
    sidecar: { baseUrl: "http://127.0.0.1:1", secret: "s" },
    connections: { resolveConnectionAuth: async () => ({ error: "none" }), listConnectionSummaries: () => [], activeConnectionId: () => null },
    appVersion: "1.0.0",
    readEnabled: () => true,
    writeEnabled: () => undefined,
    readHttp: () => http,
    writeHttp: (next) => {
      http = next;
    },
    httpToken: store,
    clipboard: options.clipboard,
  });
  return { service, store, tokenPath, current: () => http };
}

const discovery = () => JSON.parse(readFileSync(join(dir, "mcp-endpoint.json"), "utf-8")) as { port: number; token: string };

async function post(port: number, token: string | null) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  await response.text();
  return response.status;
}

describe("HTTP token store", () => {
  it("creates a 64-hex token on first use, stores it encrypted, and returns the same one after that", async () => {
    const { store, tokenPath } = make();
    const token = await store.getOrCreate();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.getOrCreate()).toBe(token);
    expect((await readFile(tokenPath)).toString()).not.toContain(token);
  });

  it("keeps the token across service restarts", async () => {
    const first = await make().store.getOrCreate();
    const second = await createHttpTokenStore(join(dir, "mcp-http-token.bin"), fakeBox()).getOrCreate();
    expect(second).toBe(first);
  });

  it("replaces the token on regenerate", async () => {
    const { store } = make();
    const old = await store.getOrCreate();
    const next = await store.regenerate();
    expect(next).toMatch(/^[0-9a-f]{64}$/);
    expect(next).not.toBe(old);
    expect(await store.getOrCreate()).toBe(next);
  });

  it("makes a new token when the saved one cannot be read", async () => {
    const { store, tokenPath } = make();
    const old = await store.getOrCreate();
    await rm(tokenPath);
    expect(await store.getOrCreate()).not.toBe(old);
  });

  it("refuses to work without secure storage", async () => {
    const { store } = make({ box: fakeBox(false) });
    await expect(store.getOrCreate()).rejects.toThrow(/Secure storage is not available/);
  });
});

describe("direct HTTP option", () => {
  it("is off by default: an ephemeral port and the connector token only", async () => {
    const { service } = make();
    await service.start();
    expect(service.status().http).toEqual({ enabled: false, port: DEFAULT_HTTP_PORT });
    expect(service.status().port).not.toBe(DEFAULT_HTTP_PORT);
  });

  it("listens on the fixed port and accepts both tokens, while the discovery file holds the connector token only", async () => {
    bypassMsw();
    const port = await freePort();
    const { service, store } = make({ http: { enabled: true, port } });
    await service.start();
    const httpToken = await store.getOrCreate();
    const { token: connectorToken, port: discoveredPort } = discovery();

    expect(service.status()).toMatchObject({ running: true, port, error: null });
    expect(discoveredPort).toBe(port);
    expect(connectorToken).not.toBe(httpToken);
    expect(await post(port, connectorToken)).not.toBe(401);
    expect(await post(port, httpToken)).not.toBe(401);
    expect(await post(port, "f".repeat(64))).toBe(401);
    expect(await post(port, null)).toBe(401);
  });

  it("never puts a token in the status", async () => {
    const port = await freePort();
    const { service, store } = make({ http: { enabled: true, port } });
    await service.start();
    await store.getOrCreate();
    expect(JSON.stringify(service.status())).not.toMatch(/[0-9a-f]{64}/);
  });

  it("regenerating invalidates the old token and the new one works after the restart", async () => {
    bypassMsw();
    const port = await freePort();
    const { service, store } = make({ http: { enabled: true, port } });
    await service.start();
    const old = await store.getOrCreate();
    expect(await post(port, old)).not.toBe(401);

    const status = await service.regenerateHttpToken();

    expect(status.running).toBe(true);
    const fresh = await store.getOrCreate();
    expect(fresh).not.toBe(old);
    expect(await post(port, old)).toBe(401);
    expect(await post(port, fresh)).not.toBe(401);
    expect(JSON.stringify(status)).not.toContain(fresh);
  });

  it("copies the client config from main, with the token, and returns nothing", async () => {
    const written: string[] = [];
    const port = await freePort();
    const { service, store } = make({ http: { enabled: true, port }, clipboard: { writeText: (t) => void written.push(t) } });

    expect(await service.copyHttpConfig()).toBeUndefined();

    const token = await store.getOrCreate();
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0])).toEqual({
      type: "http",
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  it("refuses to copy a config while the option is off or without a clipboard", async () => {
    const off = make({ clipboard: { writeText: vi.fn() } });
    await expect(off.service.copyHttpConfig()).rejects.toThrow(/Turn on the HTTP option/);
    const noClipboard = make({ http: { enabled: true, port: await freePort() } });
    await expect(noClipboard.service.copyHttpConfig()).rejects.toThrow(/clipboard/);
  });

  it("restarts a running server on the new port when the option is switched on", async () => {
    bypassMsw();
    const { service } = make();
    await service.start();
    const port = await freePort();

    const status = await service.setHttp({ enabled: true, port });

    expect(status).toMatchObject({ running: true, port, http: { enabled: true, port } });
    expect(discovery().port).toBe(port);
  });

  it("switching the option off goes back to an ephemeral port", async () => {
    const port = await freePort();
    const { service } = make({ http: { enabled: true, port } });
    await service.start();

    const status = await service.setHttp({ enabled: false, port });

    expect(status.running).toBe(true);
    expect(status.port).not.toBe(port);
  });

  it("reports a port that is in use and stays off", async () => {
    const blocker = createServer();
    blockers.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const taken = (blocker.address() as { port: number }).port;
    const { service } = make({ http: { enabled: true, port: taken } });

    await service.start();

    expect(service.status()).toMatchObject({ running: false, port: null, error: `Port ${taken} is in use` });
    await expect(readFile(join(dir, "mcp-endpoint.json"))).rejects.toBeDefined();
  });

  it("recovers once the port is free again", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const taken = (blocker.address() as { port: number }).port;
    const { service } = make({ http: { enabled: true, port: taken } });
    await service.start();
    expect(service.status().running).toBe(false);

    await new Promise((resolve) => blocker.close(resolve));
    await service.start();

    expect(service.status()).toMatchObject({ running: true, port: taken, error: null });
  });

  it.each([0, 80, 1023, 65536, 47800.5, Number.NaN])("refuses the port %j", async (port) => {
    const { service, current } = make();
    await expect(service.setHttp({ enabled: true, port })).rejects.toThrow(/1024 to 65535/);
    expect(current()).toEqual({ enabled: false, port: DEFAULT_HTTP_PORT });
  });

  it("falls back to the default port when a saved one is out of range", () => {
    const { service } = make({ http: { enabled: true, port: 80 } });
    expect(service.status().http).toEqual({ enabled: true, port: DEFAULT_HTTP_PORT });
  });
});
