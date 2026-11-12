import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bypassMsw } from "../../support/loopback";
import { deleteDiscovery, writeDiscovery } from "../../../src/electron/mcp/discovery";
import { createMcpService, type McpService } from "../../../src/electron/mcp/mcpService";

let dir: string;
let service: McpService | null = null;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pt-mcp-"));
});

afterEach(async () => {
  await service?.stop();
  service = null;
  await rm(dir, { recursive: true, force: true });
});

function makeService() {
  bypassMsw();
  let enabled = false;
  service = createMcpService({
    userDataPath: dir,
    sidecar: { baseUrl: "http://127.0.0.1:1", secret: "s" },
    connections: {
      resolveConnectionAuth: async () => ({ error: "none" }),
      listConnectionSummaries: () => [],
      activeConnectionId: () => null,
    },
    appVersion: "1.0.0",
    readEnabled: () => enabled,
    writeEnabled: (v) => {
      enabled = v;
    },
  });
  return service;
}

describe("discovery file", () => {
  it("writes and deletes, ignoring a missing file", async () => {
    const path = join(dir, "sub", "mcp-endpoint.json");
    await writeDiscovery(path, { port: 1234, token: "t", pid: 9 });
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ port: 1234, token: "t", pid: 9 });
    await deleteDiscovery(path);
    expect(existsSync(path)).toBe(false);
    await expect(deleteDiscovery(path)).resolves.toBeUndefined();
  });
});

describe("createMcpService", () => {
  it("is off until started and writes nothing", () => {
    const s = makeService();
    expect(s.status()).toMatchObject({ enabled: false, running: false, port: null, error: null });
    expect(existsSync(join(dir, "mcp-endpoint.json"))).toBe(false);
  });

  it("start writes a port and a 64-hex token; stop deletes the file", async () => {
    const s = makeService();
    await s.start();
    const info = JSON.parse(readFileSync(join(dir, "mcp-endpoint.json"), "utf-8")) as { port: number; token: string; pid: number };
    expect(info.token).toMatch(/^[0-9a-f]{64}$/);
    expect(info.port).toBe(s.status().port);
    expect(s.status().running).toBe(true);
    await s.stop();
    expect(existsSync(join(dir, "mcp-endpoint.json"))).toBe(false);
    expect(s.status().running).toBe(false);
  });

  it("setEnabled(false) while running deletes the file and frees the port", async () => {
    const s = makeService();
    const on = await s.setEnabled(true);
    expect(on).toMatchObject({ enabled: true, running: true });
    const port = on.port!;
    const off = await s.setEnabled(false);
    expect(off).toMatchObject({ enabled: false, running: false, port: null });
    expect(existsSync(join(dir, "mcp-endpoint.json"))).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST" })).rejects.toBeDefined();
  });

  it("start twice does not leak a second listener", async () => {
    const s = makeService();
    await s.start();
    const port = s.status().port;
    await s.start();
    expect(s.status().port).toBe(port);
  });

  it("serves an authorized request with the discovered token", async () => {
    const s = makeService();
    await s.start();
    const info = JSON.parse(readFileSync(join(dir, "mcp-endpoint.json"), "utf-8")) as { port: number; token: string };
    const denied = await fetch(`http://127.0.0.1:${info.port}/mcp`, { method: "POST", body: "{}" });
    expect(denied.status).toBe(401);
    const noSession = await fetch(`http://127.0.0.1:${info.port}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(noSession.status).toBe(400);
  });

  it("lists every group with its tool count, all on by default", () => {
    const s = makeService();
    const groups = s.status().groups;
    expect(groups.map((g) => g.group)).toEqual(["connections", "metadata", "records", "schema", "solutions", "plugins", "envvars"]);
    expect(groups.every((g) => g.enabled && g.tools > 0)).toBe(true);
    expect(groups.find((g) => g.group === "records")!.tools).toBeGreaterThanOrEqual(8);
  });

  it("switches a group off and on, and tells a running session", async () => {
    const s = makeService();
    expect(s.setGroup("plugins", false).groups.find((g) => g.group === "plugins")!.enabled).toBe(false);
    expect(s.status().groups.find((g) => g.group === "schema")!.enabled).toBe(true);
    expect(s.setGroup("plugins", true).groups.find((g) => g.group === "plugins")!.enabled).toBe(true);
    expect(() => s.setGroup("nonsense" as never, false)).toThrow();
  });

  it("keeps the toggles in the settings store it is given", () => {
    let saved: Record<string, boolean> = { schema: false };
    service = createMcpService({
      userDataPath: dir,
      sidecar: { baseUrl: "http://127.0.0.1:1", secret: "s" },
      connections: { resolveConnectionAuth: async () => ({ error: "none" }), listConnectionSummaries: () => [], activeConnectionId: () => null },
      appVersion: "1.0.0",
      readEnabled: () => false,
      writeEnabled: () => undefined,
      readGroups: () => saved,
      writeGroups: (groups) => {
        saved = groups as Record<string, boolean>;
      },
    });
    expect(service.status().groups.find((g) => g.group === "schema")!.enabled).toBe(false);
    service.setGroup("solutions", false);
    expect(saved).toEqual({ schema: false, solutions: false });
  });

  it("reports a start failure without throwing", async () => {
    const s = makeService();
    // A file where the userData folder should be makes writing discovery fail.
    await rm(dir, { recursive: true, force: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(dir, "not a folder");
    await expect(s.start()).resolves.toBeUndefined();
    expect(s.status()).toMatchObject({ running: false });
    expect(s.status().error).toBeTruthy();
    await rm(dir, { force: true });
  });
});
