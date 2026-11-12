import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../src/ui/shared/api/client";
import type { ConnectionInfo } from "../../src/ui/shared/connections";
import { createHostServices } from "../../src/ui/shell/community-tools/hostServices";
import { FORWARDED_SHORTCUTS } from "../../src/ui/shell/community-tools/themeSnapshot";
import { matchShellShortcut } from "../../src/ui/shell/keyboard/shellShortcuts";
import { createFakeDesktopBridge, installDesktopBridge, type DesktopBridgeOverrides } from "../support/desktopBridge";

const connection: ConnectionInfo = {
  id: "conn-1",
  legacyName: null,
  organization: "Contoso",
  environment: "Dev",
  browser: null,
  envUrl: "https://contoso.crm.dynamics.com",
  crmType: "online",
  needsPassword: false,
  displayName: "Contoso - Dev",
  environmentKind: "dev",
  isUngrouped: false,
};

function services(overrides: { connection?: ConnectionInfo | null; bridge?: DesktopBridgeOverrides; active?: boolean } = {}) {
  installDesktopBridge(createFakeDesktopBridge(overrides.bridge));
  const openInBrowser = vi.fn().mockResolvedValue({ fallback: false });
  const showToast = vi.fn();
  const setStatus = vi.fn();
  const built = createHostServices({
    toolId: "acme.tool",
    toolName: "Acme",
    getConnection: () => (overrides.connection === undefined ? connection : overrides.connection),
    openInBrowser,
    toast: { showToast },
    setStatus,
    requestConfirm: vi.fn().mockResolvedValue(true),
    dispatchShortcut: vi.fn(),
    isActive: () => overrides.active ?? true,
  });
  return { built, openInBrowser, showToast, setStatus, overrides };
}

function axiosFailure(response?: { status: number; data: unknown }) {
  return Object.assign(new Error("request failed"), { isAxiosError: true, response });
}

beforeEach(() => {
  vi.spyOn(api, "request").mockResolvedValue({ data: { ok: 1 } });
});
afterEach(() => vi.restoreAllMocks());

describe("community tool host services", () => {
  it("exposes only displayName and kind for the connection", () => {
    const { built } = services();
    expect(built.getConnection()).toEqual({ displayName: "Contoso - Dev", kind: "online" });
    expect(Object.keys(built.getConnection() ?? {}).sort()).toEqual(["displayName", "kind"]);
    expect(services({ connection: null }).built.getConnection()).toBeNull();
  });

  it("sends sidecar calls on the tab connection and stops auth replay on writes", async () => {
    const { built } = services();
    await built.callSidecar("POST", "/api/community-tools/data/create", { a: 1 }, "conn-1");
    await built.callSidecar("POST", "/api/community-tools/data/fetch", { a: 1 }, "conn-1");
    await built.callSidecar("GET", "/api/community-tools/metadata/tables", undefined, "conn-1");
    const calls = vi.mocked(api.request).mock.calls.map(([config]) => config);
    expect(calls[0]).toMatchObject({ method: "POST", meta: { connectionId: "conn-1", noAuthRetry: true } });
    expect(calls[1]?.meta).toEqual({ connectionId: "conn-1", noAuthRetry: false });
    expect(calls[2]?.meta).toEqual({ connectionId: "conn-1", noAuthRetry: false });
  });

  it("exposes the connection id as the key and reports whether the tab is active", () => {
    expect(services().built.connectionKey()).toBe("conn-1");
    expect(services({ connection: null }).built.connectionKey()).toBeNull();
    expect(services().built.isActive()).toBe(true);
    expect(services({ active: false }).built.isActive()).toBe(false);
  });

  it("uses the key it is given, not the live connection", async () => {
    const { built, overrides } = services();
    overrides.connection = { ...connection, id: "conn-2" };
    await built.callSidecar("GET", "/api/community-tools/metadata/tables", undefined, "conn-1");
    expect(vi.mocked(api.request).mock.calls[0]?.[0]?.meta).toMatchObject({ connectionId: "conn-1" });
  });

  it("never sends a path outside /api/community-tools/", async () => {
    const { built } = services();
    for (const path of [
      "/api/other",
      "/api/community-toolsX/a",
      "http://evil.test/api/community-tools/a",
      "/api/community-tools/../secrets",
    ]) {
      await expect(built.callSidecar("GET", path, undefined, "conn-1")).rejects.toMatchObject({ code: "Internal" });
    }
    expect(api.request).not.toHaveBeenCalled();
  });

  it("refuses a sidecar call without a connection", async () => {
    const { built } = services({ connection: null });
    await expect(built.callSidecar("GET", "/api/community-tools/metadata/tables", undefined, null)).rejects.toMatchObject({
      code: "NoConnection",
      message: "This tab is not connected to an environment.",
    });
    expect(api.request).not.toHaveBeenCalled();
  });

  it("maps a 429 body code to a Throttled error and unknown failures to Internal", async () => {
    const { built } = services();
    vi.mocked(api.request).mockRejectedValueOnce(axiosFailure({ status: 429, data: { code: "Throttled", message: "Slow down" } }));
    await expect(built.callSidecar("POST", "/api/community-tools/data/fetch", {}, "conn-1")).rejects.toEqual({
      code: "Throttled",
      message: "Slow down",
    });

    vi.mocked(api.request).mockRejectedValueOnce(
      axiosFailure({ status: 400, data: { code: "DataverseFault", message: "Bad", dataverseCode: -2147220969 } }),
    );
    await expect(built.callSidecar("POST", "/api/community-tools/data/fetch", {}, "conn-1")).rejects.toEqual({
      code: "DataverseFault",
      message: "Bad",
      dataverseCode: -2147220969,
    });

    vi.mocked(api.request).mockRejectedValueOnce(axiosFailure());
    await expect(built.callSidecar("GET", "/api/community-tools/metadata/tables", undefined, "conn-1")).rejects.toEqual({
      code: "Internal",
      message: "The host could not complete the request.",
    });

    vi.mocked(api.request).mockRejectedValueOnce(axiosFailure({ status: 500, data: { code: "Teapot", message: "x" } }));
    await expect(built.callSidecar("GET", "/api/community-tools/metadata/tables", undefined, "conn-1")).rejects.toMatchObject({
      code: "Internal",
    });
  });

  it("truncates status text to 200 characters", () => {
    const { built, setStatus } = services();
    built.setStatus("x".repeat(500));
    built.setStatus(null);
    expect(setStatus).toHaveBeenNthCalledWith(1, "x".repeat(200));
    expect(setStatus).toHaveBeenNthCalledWith(2, null);
  });

  it("opens records and solutions through the connection's browser", () => {
    const { built, openInBrowser, showToast } = services();
    built.openRecord("account", "{11111111-1111-1111-1111-111111111111}");
    expect(openInBrowser).toHaveBeenCalledWith(
      "https://contoso.crm.dynamics.com/main.aspx?etn=account&pagetype=entityrecord&id=11111111-1111-1111-1111-111111111111",
    );
    built.openSolution("22222222-2222-2222-2222-222222222222");
    expect(openInBrowser).toHaveBeenLastCalledWith(
      "https://contoso.crm.dynamics.com/tools/solution/edit.aspx?id=22222222-2222-2222-2222-222222222222",
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it("maps file bridge results and refusals", async () => {
    const ok = services({ bridge: { openFileForCommunityTool: async () => ({ name: "a.txt", content: "hi" }) } });
    await expect(ok.built.openFile([])).resolves.toEqual({ name: "a.txt", content: "hi" });

    const none = services({ bridge: { openFileForCommunityTool: async () => null } });
    await expect(none.built.openFile([])).resolves.toBeNull();

    const err = services({ bridge: { openFileForCommunityTool: async () => ({ error: "Too large" }) } });
    await expect(err.built.openFile([])).rejects.toEqual({ code: "Internal", message: "Too large" });

    const refused = services({
      bridge: {
        openFileForCommunityTool: async () => {
          throw new Error("IPC refused");
        },
        saveFileForCommunityTool: async () => {
          throw new Error("IPC refused");
        },
      },
    });
    await expect(refused.built.openFile([])).rejects.toEqual({
      code: "Internal",
      message: "The host could not complete the request.",
    });
    await expect(refused.built.saveFile("a.txt", "x")).rejects.toMatchObject({ code: "Internal" });
  });

  it("keeps two quick storage sets from losing an update", async () => {
    let stored: Record<string, unknown> = {};
    const { built } = services({
      bridge: {
        readCommunityToolStorage: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { ...stored };
        },
        writeCommunityToolStorage: async (_id, data) => {
          stored = data;
        },
      },
    });
    await Promise.all([built.storage.set("a", 1), built.storage.set("b", 2)]);
    expect(stored).toEqual({ a: 1, b: 2 });
    await expect(built.storage.get("a")).resolves.toBe(1);
    await expect(built.storage.get("constructor")).resolves.toBeUndefined();
    await built.storage.remove("a");
    expect(stored).toEqual({ b: 2 });
  });

  it("shows a warning toast as a warning, not as info", () => {
    const { built, showToast } = services();
    built.toast("warning", "Careful");
    expect(showToast).toHaveBeenCalledWith("Careful", "warning");
  });

  it("keeps two tabs of the same tool from losing each other's storage updates", async () => {
    let stored: Record<string, unknown> = {};
    const bridge = {
      readCommunityToolStorage: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ...stored };
      },
      writeCommunityToolStorage: async (_id: string, data: Record<string, unknown>) => {
        stored = data;
      },
    };
    const first = services({ bridge }).built;
    const second = services({ bridge }).built;

    await Promise.all([first.storage.set("a", 1), second.storage.set("b", 2), first.storage.set("c", 3), second.storage.remove("a")]);

    expect(stored).toEqual({ b: 2, c: 3 });
  });

  it("lists exactly the five forwarded shell shortcuts", () => {
    const matched = FORWARDED_SHORTCUTS.map((spec) =>
      matchShellShortcut({ key: spec.key, ctrlKey: spec.ctrl, shiftKey: spec.shift, metaKey: false, altKey: false }),
    );
    expect(matched).toHaveLength(5);
    expect(new Set(matched)).toEqual(
      new Set(["close-tab", "next-tab", "previous-tab", "toggle-quick-open", "toggle-sidebar"]),
    );
  });
});
