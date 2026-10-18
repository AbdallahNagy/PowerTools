import { createRequire } from "node:module";

import type { IpcRenderer } from "electron";
import { describe, expect, it } from "vitest";

type CreatePreloadApi = (
  ipcRenderer: Pick<IpcRenderer, "invoke" | "on" | "removeListener">,
) => Window["electron"];

const require = createRequire(import.meta.url);
const { createPreloadApi } = require("../../dist-electron/preloadApi.cjs") as {
  createPreloadApi: CreatePreloadApi;
};

type Listener = (event: unknown, payload: unknown) => void;

function createIpcRendererFake() {
  const invocations: Array<{ channel: string; args: unknown[] }> = [];
  const listeners = new Map<string, Listener>();
  const removals: Array<{ channel: string; listener: Listener }> = [];

  return {
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => {
        const invocation = { channel, args };
        invocations.push(invocation);
        return Promise.resolve(invocation);
      },
      on: (channel: string, listener: Listener) => {
        listeners.set(channel, listener);
      },
      removeListener: (channel: string, listener: Listener) => {
        removals.push({ channel, listener });
      },
    },
    invocations,
    listeners,
    removals,
  };
}

describe("createPreloadApi", () => {
  it.each([
    ["createConnectionWindow", [], "create-connection-window", []],
    ["saveConnectionData", [{ crmType: "online", serverUrl: "https://example.test" }], "save-connection-data", [{ crmType: "online", serverUrl: "https://example.test" }]],
    ["getPendingConnection", [], "get-pending-connection", []],
    ["saveConnectionDetails", [{ organization: "Contoso", environment: "Dev", browser: null }], "save-connection-details", [{ organization: "Contoso", environment: "Dev", browser: null }]],
    ["listConnections", [], "list-connections", []],
    ["getConnection", ["Primary"], "get-connection", ["Primary"]],
    ["setActiveConnection", ["Primary"], "set-active-connection", ["Primary"]],
    ["deleteConnection", ["Primary"], "delete-connection", ["Primary"]],
    ["updateConnection", ["Primary", { environment: "Dev 2" }], "update-connection", ["Primary", { environment: "Dev 2" }]],
    ["getActiveConnectionId", [], "get-active-connection-id", []],
    ["openConnectionManager", ["Primary"], "open-connection-manager", ["Primary", null]],
    ["openConnectionManager", [null, "import"], "open-connection-manager", [null, "import"]],
    ["openConnectionManager", [], "open-connection-manager", [null, null]],
    ["takeConnectionManagerRequest", [], "take-connection-manager-request", []],
    ["listBrowsers", [], "list-browsers", []],
    ["openUrlForConnection", ["Primary", "https://example.test"], "open-url-for-connection", ["Primary", "https://example.test"]],
    ["openUrlInBrowser", [{ id: "edge", profile: "Profile 1" }, "https://example.test"], "open-url-in-browser", [{ id: "edge", profile: "Profile 1" }, "https://example.test"]],
    ["exportConnections", [], "export-connections", [null]],
    ["exportConnections", [["Primary"]], "export-connections", [["Primary"]]],
    ["previewConnectionImport", [], "preview-connection-import", []],
    ["commitConnectionImport", [["a"]], "commit-connection-import", [["a"]]],
    ["getActiveConnection", [], "get-active-connection", []],
    ["refreshToken", [], "refresh-token", []],
    ["getApiBaseUrl", [], "get-api-base-url", []],
    ["getLocalSecret", [], "get-local-secret", []],
    ["getAppVersion", [], "get-app-version", []],
    ["getUpdateStatus", [], "get-update-status", []],
    ["checkForUpdates", [], "check-for-updates", []],
    ["downloadUpdate", [], "download-update", []],
    ["installUpdate", [], "install-update", []],
    ["openExternalUrl", ["https://example.test/docs"], "open-external-url", ["https://example.test/docs"]],
    ["popupAppMenu", ["file", 10, 32], "popup-app-menu", ["file", 10, 32]],
    ["minimizeWindow", [], "window-minimize", []],
    ["toggleMaximizeWindow", [], "window-toggle-maximize", []],
    ["closeWindow", [], "window-close", []],
    ["isWindowMaximized", [], "window-is-maximized", []],
  ] as const)(
    "%s invokes %s with the existing arguments",
    async (methodName, methodArgs, expectedChannel, expectedArgs) => {
      const { ipcRenderer, invocations } = createIpcRendererFake();
      const api = createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">);

      const result = await (api[methodName] as (...args: readonly unknown[]) => Promise<unknown>)(...methodArgs);

      expect(invocations).toEqual([{ channel: expectedChannel, args: expectedArgs }]);
      expect(result).toEqual({ channel: expectedChannel, args: expectedArgs });
    },
  );

  it("forwards connection status payloads and preserves the void return", () => {
    const { ipcRenderer, listeners } = createIpcRendererFake();
    const api = createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">);
    const received: Array<string | null> = [];

    const result = api.onConnectionStatusUpdate((name) => received.push(name));
    listeners.get("connection-status-update")?.({ ignored: true }, null);

    expect(result).toBeUndefined();
    expect(received).toEqual([null]);
  });

  it("forwards connection updates and unsubscribes the same listener", () => {
    const { ipcRenderer, listeners, removals } = createIpcRendererFake();
    const api = createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">);
    const received: unknown[] = [];

    const unsubscribe = api.onConnectionsUpdated((connections) => received.push(connections));
    const listener = listeners.get("connections-updated");
    const payload = [{ name: "Primary", envUrl: "https://example.test", crmType: "online" }];
    listener?.({ ignored: true }, payload);
    unsubscribe();

    expect(received).toEqual([payload]);
    expect(removals).toEqual([{ channel: "connections-updated", listener }]);
  });

  it("forwards update status changes and unsubscribes the same listener", () => {
    const { ipcRenderer, listeners, removals } = createIpcRendererFake();
    const api = createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">);
    const received: unknown[] = [];

    const unsubscribe = api.onUpdateStatusChanged((status) => received.push(status));
    const listener = listeners.get("update-status-changed");
    const payload = { state: "downloading", version: "1.2.3", percent: 42 };
    listener?.({ ignored: true }, payload);
    unsubscribe();

    expect(received).toEqual([payload]);
    expect(removals).toEqual([{ channel: "update-status-changed", listener }]);
  });

  it("forwards window maximize changes and unsubscribes the same listener", () => {
    const { ipcRenderer, listeners, removals } = createIpcRendererFake();
    const api = createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">);
    const received: boolean[] = [];

    const unsubscribe = api.onWindowMaximizedChanged((maximized) => received.push(maximized));
    const listener = listeners.get("window-maximized-changed");
    listener?.({ ignored: true }, true);
    unsubscribe();

    expect(received).toEqual([true]);
    expect(removals).toEqual([{ channel: "window-maximized-changed", listener }]);
  });

  it("exposes exactly the declared renderer methods", () => {
    const { ipcRenderer } = createIpcRendererFake();

    expect(Object.keys(createPreloadApi(ipcRenderer as Pick<IpcRenderer, "invoke" | "on" | "removeListener">))).toEqual([
      "createConnectionWindow",
      "saveConnectionData",
      "getPendingConnection",
      "saveConnectionDetails",
      "onConnectionStatusUpdate",
      "onConnectionsUpdated",
      "listConnections",
      "getConnection",
      "setActiveConnection",
      "deleteConnection",
      "updateConnection",
      "getActiveConnectionId",
      "getActiveConnection",
      "refreshToken",
      "openConnectionManager",
      "takeConnectionManagerRequest",
      "onConnectionManagerRequest",
      "listBrowsers",
      "openUrlForConnection",
      "openUrlInBrowser",
      "exportConnections",
      "previewConnectionImport",
      "commitConnectionImport",
      "getApiBaseUrl",
      "getLocalSecret",
      "getAppVersion",
      "getUpdateStatus",
      "checkForUpdates",
      "downloadUpdate",
      "installUpdate",
      "onUpdateStatusChanged",
      "openExternalUrl",
      "popupAppMenu",
      "minimizeWindow",
      "toggleMaximizeWindow",
      "closeWindow",
      "isWindowMaximized",
      "onWindowMaximizedChanged",
    ]);
  });
});
