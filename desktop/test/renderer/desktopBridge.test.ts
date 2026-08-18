import { describe, expect, it } from "vitest";

import { createFakeDesktopBridge } from "../support/desktopBridge";

describe("createFakeDesktopBridge", () => {
  it("delivers connection updates to active listeners and unsubscribes only the caller", () => {
    const bridge = createFakeDesktopBridge();
    const firstListenerUpdates: Array<{ name: string; envUrl: string; crmType: string }> = [];
    const secondListenerUpdates: Array<{ name: string; envUrl: string; crmType: string }> = [];
    const firstConnections: Awaited<ReturnType<typeof bridge.listConnections>> = [
      { name: "Development", envUrl: "https://dev.example.test", crmType: "online" },
    ];
    const secondConnections: Awaited<ReturnType<typeof bridge.listConnections>> = [
      { name: "Production", envUrl: "https://prod.example.test", crmType: "onpremise" },
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
    await expect(bridge.saveConnectionName("Development")).resolves.toBeUndefined();
    await expect(bridge.listConnections()).resolves.toEqual([]);
    await expect(bridge.getConnection("missing")).resolves.toEqual({ error: "Connection not found" });
    await expect(bridge.setActiveConnection("missing")).resolves.toEqual({ success: true });
    await expect(bridge.deleteConnection("missing")).resolves.toEqual({ success: true });
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

    expect(() => bridge.onConnectionStatusUpdate(() => undefined)).not.toThrow();
    expect(() => bridge.onUpdateStatusChanged(() => undefined)()).not.toThrow();
  });
});
