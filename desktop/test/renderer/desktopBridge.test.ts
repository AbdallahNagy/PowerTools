import { describe, expect, it } from "vitest";

import {
  desktopBridge,
  getDesktopBridge,
} from "../../src/ui/platform/desktopBridge";
import {
  createFakeDesktopBridge,
  installDesktopBridge,
 legacyConnection } from "../support/desktopBridge";

describe("desktopBridge", () => {
  it("allows browser-only startup to detect a missing preload bridge", () => {
    const originalBridge = getDesktopBridge();
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      expect(getDesktopBridge()).toBeUndefined();
    } finally {
      if (originalBridge) {
        installDesktopBridge(originalBridge);
      } else {
        Reflect.deleteProperty(window, "electron");
      }
    }
  });

  it("delegates desktop operations with their existing arguments and results", async () => {
    const observed: unknown[] = [];
    installDesktopBridge(createFakeDesktopBridge({
      saveConnectionData: async (data) => {
        observed.push(["saveConnectionData", data]);
        return { success: false, error: "save failed" };
      },
      saveConnectionDetails: async (description) => {
        observed.push(["saveConnectionDetails", description]);
        return { success: true, id: "Primary" };
      },
      getConnection: async (name) => {
        observed.push(["getConnection", name]);
        return {
          id: name,
          envUrl: "https://example.test",
          crmType: "online",
          token: "token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        };
      },
      setActiveConnection: async (name) => {
        observed.push(["setActiveConnection", name]);
        return { success: false, error: "activate failed" };
      },
      deleteConnection: async (name) => {
        observed.push(["deleteConnection", name]);
        return { success: false, error: "delete failed" };
      },
      getActiveConnectionId: async () => {
        observed.push(["getActiveConnectionId"]);
        return "Primary";
      },
      openExternalUrl: async (url) => {
        observed.push(["openExternalUrl", url]);
      },
      popupAppMenu: async (menuId, x, y) => {
        observed.push(["popupAppMenu", menuId, x, y]);
      },
      minimizeWindow: async () => {
        observed.push(["minimizeWindow"]);
      },
    }));

    const connectionInput = {
      crmType: "online" as const,
      serverUrl: "https://example.test",
    };

    await expect(desktopBridge.saveConnectionData(connectionInput)).resolves.toEqual({
      success: false,
      error: "save failed",
    });
    const description = { organization: "Contoso", environment: "Dev", browser: null };
    await expect(desktopBridge.saveConnectionDetails(description)).resolves.toEqual({ success: true, id: "Primary" });
    await expect(desktopBridge.getConnection("Primary")).resolves.toEqual({
      id: "Primary",
      envUrl: "https://example.test",
      crmType: "online",
      token: "token",
      expiresOn: "2099-01-01T00:00:00.000Z",
    });
    await expect(desktopBridge.setActiveConnection("Primary")).resolves.toEqual({
      success: false,
      error: "activate failed",
    });
    await expect(desktopBridge.deleteConnection("Primary")).resolves.toEqual({
      success: false,
      error: "delete failed",
    });
    await expect(desktopBridge.getActiveConnectionId()).resolves.toBe("Primary");
    await expect(desktopBridge.openExternalUrl("https://example.test/docs")).resolves.toBeUndefined();
    await expect(desktopBridge.popupAppMenu("file", 8, 24)).resolves.toBeUndefined();
    await expect(desktopBridge.minimizeWindow()).resolves.toBeUndefined();

    expect(observed).toEqual([
      ["saveConnectionData", connectionInput],
      ["saveConnectionDetails", { organization: "Contoso", environment: "Dev", browser: null }],
      ["getConnection", "Primary"],
      ["setActiveConnection", "Primary"],
      ["deleteConnection", "Primary"],
      ["getActiveConnectionId"],
      ["openExternalUrl", "https://example.test/docs"],
      ["popupAppMenu", "file", 8, 24],
      ["minimizeWindow"],
    ]);
  });

  it("preserves desktop event delivery and unsubscribe behavior", () => {
    const fake = createFakeDesktopBridge();
    installDesktopBridge(fake);
    const connectionStatuses: Array<string | null> = [];
    const connectionLists: Array<string[]> = [];
    const updateStates: string[] = [];

    expect(desktopBridge.onConnectionStatusUpdate((name) => {
      connectionStatuses.push(name);
    })).toBeUndefined();
    const unsubscribeConnections = desktopBridge.onConnectionsUpdated((connections) => {
      connectionLists.push(connections.map((connection) => connection.id));
    });
    const unsubscribeUpdates = desktopBridge.onUpdateStatusChanged((status) => {
      updateStates.push(status.state);
    });

    fake.emitConnectionStatusUpdate("Primary");
    fake.emitConnectionsUpdated([
      legacyConnection("Primary", "https://example.test", "online"),
    ]);
    fake.emitUpdateStatusChanged({ state: "available", version: "1.2.3" });
    unsubscribeConnections();
    unsubscribeUpdates();
    fake.emitConnectionsUpdated([
      legacyConnection("Ignored", "https://ignored.test", "onpremise"),
    ]);
    fake.emitUpdateStatusChanged({ state: "idle" });

    expect(connectionStatuses).toEqual(["Primary"]);
    expect(connectionLists).toEqual([["Primary"]]);
    expect(updateStates).toEqual(["available"]);
  });
});

describe("createFakeDesktopBridge", () => {
  it("delivers connection updates to active listeners and unsubscribes only the caller", () => {
    const bridge = createFakeDesktopBridge();
    const firstListenerUpdates: unknown[] = [];
    const secondListenerUpdates: unknown[] = [];
    const firstConnections: Awaited<ReturnType<typeof bridge.listConnections>> = [
      legacyConnection("Development", "https://dev.example.test", "online"),
    ];
    const secondConnections: Awaited<ReturnType<typeof bridge.listConnections>> = [
      legacyConnection("Production", "https://prod.example.test", "onpremise"),
    ];

    const unsubscribeFirst = bridge.onConnectionsUpdated((connections) => {
      firstListenerUpdates.push(...connections);
    });
    bridge.onConnectionsUpdated((connections) => {
      secondListenerUpdates.push(...connections);
    });

    bridge.emitConnectionsUpdated(firstConnections);
    unsubscribeFirst();
    bridge.emitConnectionsUpdated(secondConnections);

    expect(firstListenerUpdates).toEqual(firstConnections);
    expect(secondListenerUpdates).toEqual([...firstConnections, ...secondConnections]);
  });

  it("provides safe default results for every desktop capability", async () => {
    const bridge = createFakeDesktopBridge();

    await expect(bridge.createConnectionWindow()).resolves.toBeUndefined();
    await expect(bridge.saveConnectionData({ crmType: "online", serverUrl: "https://example.test" })).resolves.toEqual({ success: true });
    await expect(bridge.saveConnectionDetails({ organization: "Contoso", environment: "Dev", browser: null })).resolves.toEqual({ success: true });
    await expect(bridge.listConnections()).resolves.toEqual([]);
    await expect(bridge.getConnection("missing")).resolves.toEqual({ error: "Connection not found" });
    await expect(bridge.setActiveConnection("missing")).resolves.toEqual({ success: true });
    await expect(bridge.deleteConnection("missing")).resolves.toEqual({ success: true });
    await expect(bridge.getActiveConnectionId()).resolves.toBeNull();
    await expect(bridge.getActiveConnection()).resolves.toEqual({ error: "No active connection" });
    await expect(bridge.refreshToken()).resolves.toEqual({ error: "No active connection" });
    await expect(bridge.getApiBaseUrl()).resolves.toBe("http://localhost");
    await expect(bridge.getLocalSecret()).resolves.toBe("");
    await expect(bridge.getAppVersion()).resolves.toBe("0.0.0-test");
    await expect(bridge.getUpdateStatus()).resolves.toEqual({ state: "idle" });
    await expect(bridge.checkForUpdates()).resolves.toBeUndefined();
    await expect(bridge.downloadUpdate()).resolves.toBeUndefined();
    await expect(bridge.installUpdate()).resolves.toBeUndefined();
    await expect(bridge.openExternalUrl("https://example.test")).resolves.toBeUndefined();
    await expect(bridge.popupAppMenu("help", 0, 0)).resolves.toBeUndefined();
    await expect(bridge.minimizeWindow()).resolves.toBeUndefined();
    await expect(bridge.toggleMaximizeWindow()).resolves.toBeUndefined();
    await expect(bridge.closeWindow()).resolves.toBeUndefined();
    await expect(bridge.isWindowMaximized()).resolves.toBe(false);

    expect(() => bridge.onConnectionStatusUpdate(() => undefined)).not.toThrow();
    expect(() => bridge.onUpdateStatusChanged(() => undefined)()).not.toThrow();
    expect(() => bridge.onWindowMaximizedChanged(() => undefined)()).not.toThrow();
  });
});
