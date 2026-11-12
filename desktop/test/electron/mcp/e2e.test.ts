import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpService, type McpService } from "../../../src/electron/mcp/mcpService";
import { bypassMsw } from "../../support/loopback";

// The connector is a mode of the sidecar executable. Build it first with
//   dotnet build ../api/PowerTools/PowerTools.API   (or npm run publish:api:win and point CONNECTOR_EXE at it)
const desktopDir = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const connectorExe =
  process.env.CONNECTOR_EXE ??
  resolve(desktopDir, "..", "api", "PowerTools", "PowerTools.API", "bin", "Debug", "net9.0", "PowerTools.API.exe");
const built = existsSync(connectorExe);
if (!built) {
  console.warn(`Skipping the connector end-to-end test: ${connectorExe} is missing. Run "dotnet build ../api/PowerTools/PowerTools.API" first.`);
}

let service: McpService | null = null;
let client: Client | null = null;
let dir: string | null = null;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  await service?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
  client = null;
  service = null;
  dir = null;
});

describe("stdio connector end to end", () => {
  it.skipIf(!built)("lists the tools and calls connections_list through the connector", async () => {
    bypassMsw();
    dir = await mkdtemp(join(tmpdir(), "pt-mcp-e2e-"));
    service = createMcpService({
      userDataPath: dir,
      sidecar: { baseUrl: "http://127.0.0.1:1", secret: "unused" },
      connections: {
        resolveConnectionAuth: async () => ({ error: "not used by connections_list" }),
        listConnectionSummaries: () => [
          { id: "id-1", organization: "Contoso", environment: "Dev", legacyName: null, envUrl: "https://contoso-dev.crm.dynamics.com", crmType: "online" },
        ],
        activeConnectionId: () => "id-1",
      },
      appVersion: "1.0.0",
      readEnabled: () => true,
      writeEnabled: () => undefined,
    });
    await service.start();
    expect(service.status().running).toBe(true);

    client = new Client({ name: "e2e", version: "1" });
    await client.connect(
      new StdioClientTransport({
        command: connectorExe,
        args: ["--mcp-connector", "--discovery", join(dir, "mcp-endpoint.json")],
      }),
    );

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("connections_list");
    expect(tools).toHaveLength(39);

    const result = await client.callTool({ name: "connections_list", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      connections: [{ displayName: "Contoso · Dev", kind: "online", active: true }],
    });
  }, 30_000);
});
