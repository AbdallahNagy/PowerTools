import { describe, expect, it, vi } from "vitest";
import { createConnectorSetup, type ConnectorSetupDeps } from "../../../src/electron/mcp/connectorSetup";

function deps(overrides: Partial<ConnectorSetupDeps> = {}): ConnectorSetupDeps {
  return {
    packaged: true,
    platform: "win32",
    resourcesPath: "C:\\Program Files\\Power Tools\\resources",
    appPath: () => "C:\\Program Files\\Power Tools\\resources\\app.asar",
    homePath: () => "C:\\Users\\me",
    appDataPath: () => "C:\\Users\\me\\AppData\\Roaming",
    localAppData: "C:\\Users\\me\\AppData\\Local",
    appFolderName: () => "Power Tools",
    log: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("connector setup", () => {
  it("launches the per-user copy", () => {
    const launch = createConnectorSetup(deps()).launch("unused");
    expect(launch).toEqual({ command: expect.stringContaining("AppData") as string, args: [] });
    expect(launch.command).toMatch(/Power Tools[\\/]mcp[\\/]Dyno\.McpConnector\.exe$/);
  });

  it("never rejects, even when the app paths throw", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const setup = createConnectorSetup(
      deps({
        log,
        appPath: () => {
          throw new Error("not ready");
        },
      }),
    );
    await expect(setup.install()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });

  it("does nothing outside Windows", async () => {
    const listFiles = vi.fn();
    const setup = createConnectorSetup(deps({ platform: "linux", fs: { listFiles } as never }));
    await setup.install();
    expect(listFiles).not.toHaveBeenCalled();
    expect(await setup.legacySetups()).toEqual([]);
  });
});
