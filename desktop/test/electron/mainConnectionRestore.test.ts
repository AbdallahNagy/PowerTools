import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, loadStateMock } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  loadStateMock: vi.fn(),
}));

vi.mock("electron", () => {
  class BrowserWindow {
    static fromWebContents() {
      return null;
    }

    webContents = { send: vi.fn() };

    close() {}
    focus() {}
    isDestroyed() { return false; }
    loadFile() { return Promise.resolve(); }
    loadURL() { return Promise.resolve(); }
    maximize() {}
    once(_event: string, listener: () => void) { listener(); }
    on() {}
    show() {}
  }

  return {
    app: {
      getVersion: () => "0.0.0-test",
      isPackaged: false,
      on: vi.fn(),
      quit: vi.fn(),
      whenReady: () => Promise.resolve(),
    },
    BrowserWindow,
    dialog: { showErrorBox: vi.fn() },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
    },
    shell: { openExternal: vi.fn() },
  };
});

vi.mock("electron-updater", () => ({ default: { autoUpdater: {} } }));
vi.mock("../../src/electron/autoUpdate.js", () => ({
  configureAutoUpdates: vi.fn(() => ({
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  })),
}));
vi.mock("../../src/electron/auth.js", () => ({
  acquireTokenInteractive: vi.fn(),
  acquireTokenSilentOrInteractive: vi.fn(),
  getAccountByHomeId: vi.fn(),
  removeAccount: vi.fn(),
}));
vi.mock("../../src/electron/connectionValidation.js", () => ({
  registerOnPremisesConnection: vi.fn(),
  unregisterOnPremisesConnection: vi.fn(),
  validateDataverseConnection: vi.fn(),
  validateOnPremisesConnection: vi.fn(),
}));
vi.mock("../../src/electron/pathResolver.js", () => ({
  getAppIconPath: () => "icon.ico",
  getPreloadPath: () => "preload.cjs",
}));
vi.mock("../../src/electron/secureCredentials.js", () => ({
  decryptCredential: vi.fn(),
  encryptCredential: vi.fn(),
}));
vi.mock("../../src/electron/sidecar.js", () => ({
  start: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:5000", secret: "secret" })),
  stop: vi.fn(),
}));
vi.mock("../../src/electron/startupSplash.js", () => ({
  createStartupSplashWindow: () => ({ close: vi.fn(), isDestroyed: () => false }),
}));
vi.mock("../../src/electron/storage.js", () => ({
  loadState: loadStateMock,
  saveState: vi.fn(),
}));
vi.mock("../../src/electron/utils.js", () => ({ isDev: () => false }));

describe("desktop connection restoration", () => {
  beforeEach(() => {
    handlers.clear();
    loadStateMock.mockReset();
    vi.resetModules();
  });

  it("restores the persisted active connection for renderer tools", async () => {
    loadStateMock.mockReturnValue({
      connections: [{
        name: "Contoso Prod",
        envUrl: "https://contoso.crm.dynamics.com",
        crmType: "online",
        homeAccountId: "home-1",
      }],
      activeConnectionName: "Contoso Prod",
    });

    await import("../../src/electron/main.ts");
    await vi.waitFor(() => expect(handlers.has("get-active-connection-name")).toBe(true));

    expect(handlers.get("get-active-connection-name")?.()).toBe("Contoso Prod");
  });

  it.each([
    ["no active connection", null],
    ["a missing connection", "Missing"],
    ["an inherited object property", "constructor"],
  ])("does not restore %s", async (_scenario, activeConnectionName) => {
    loadStateMock.mockReturnValue({
      connections: [],
      activeConnectionName,
    });

    await import("../../src/electron/main.ts");
    await vi.waitFor(() => expect(handlers.has("get-active-connection-name")).toBe(true));

    expect(handlers.get("get-active-connection-name")?.()).toBeNull();
  });
});
