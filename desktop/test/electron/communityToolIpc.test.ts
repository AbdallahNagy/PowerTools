import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerCommunityToolIpc, type CommunityToolIpcDeps } from "../../src/electron/communityTools/toolIpc";
import type { CommunityToolManifest } from "../../src/electron/communityTools/manifest";

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const TOOL_ID = "contoso.record-counter";
const FOLDER = resolve("/fake/counter");

const MANIFEST: CommunityToolManifest = {
  manifestVersion: 1,
  id: TOOL_ID,
  name: "Record Counter",
  description: "Counts records.",
  version: "1.0.0",
  publisher: { name: "Contoso" },
  icon: "icon.svg",
  entry: "index.html",
  minHostVersion: "1.0.0",
  permissions: ["files"],
  messages: [],
  network: [],
  allowMultipleInstances: true,
};

function setup() {
  const handlers = new Map<string, Handler>();
  const mainContents = { id: 1 };
  const otherContents = { id: 2 };
  const mainWindow = { webContents: mainContents };
  const loaded = {
    id: TOOL_ID,
    folder: FOLDER,
    status: "ready" as const,
    errors: [],
    manifest: MANIFEST,
    iconDataUrl: null,
    consentGranted: true,
  };
  const store = {
    list: vi.fn(async () => [loaded]),
    addFolder: vi.fn(async () => loaded),
    remove: vi.fn(async () => undefined),
    grantConsent: vi.fn(async () => undefined),
    folderFor: (id: string) => (id === TOOL_ID ? FOLDER : null),
    manifestFor: (id: string) => (id === TOOL_ID ? MANIFEST : null),
    readStorage: vi.fn(async () => ({ count: 1 })),
    writeStorage: vi.fn(async () => undefined),
  };
  const dialogs = {
    chooseFolder: vi.fn(async (): Promise<string | null> => FOLDER),
    chooseOpenFile: vi.fn(async (): Promise<string | null> => join(resolve("/fake/docs"), "accounts.csv")),
    chooseSaveFile: vi.fn(async (): Promise<string | null> => join(resolve("/fake/docs"), "out.csv")),
  };
  const files = {
    size: vi.fn(async () => 12),
    readText: vi.fn(async () => "name\nContoso"),
    writeText: vi.fn(async () => undefined),
  };
  const deps = {
    ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
    store,
    getMainWindow: () => mainWindow,
    dialogs,
    files,
  } as unknown as CommunityToolIpcDeps;
  registerCommunityToolIpc(deps);

  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({ sender: mainContents }, ...args);
  const callFromOther = (channel: string, ...args: unknown[]) =>
    handlers.get(channel)!({ sender: otherContents }, ...args);

  return { handlers, store, dialogs, files, call, callFromOther, loaded };
}

describe("community tool IPC", () => {
  it("registers one channel per operation", () => {
    const { handlers } = setup();

    expect([...handlers.keys()]).toEqual([
      "list-community-tools",
      "add-community-tool-from-folder",
      "remove-community-tool",
      "grant-community-tool-consent",
      "read-community-tool-storage",
      "write-community-tool-storage",
      "open-file-for-community-tool",
      "save-file-for-community-tool",
    ]);
  });

  it("refuses every call from a sender that is not the main window", async () => {
    const { handlers, callFromOther, store, dialogs } = setup();

    for (const channel of handlers.keys()) {
      await expect(Promise.resolve().then(() => callFromOther(channel, TOOL_ID, {}))).rejects.toThrow(
        "Community tool calls are only accepted from the main window",
      );
    }
    expect(store.list).not.toHaveBeenCalled();
    expect(dialogs.chooseFolder).not.toHaveBeenCalled();
  });

  it("lists, adds, removes and grants consent through the store", async () => {
    const { call, store, loaded } = setup();

    await expect(call("list-community-tools")).resolves.toEqual([loaded]);
    await expect(call("add-community-tool-from-folder")).resolves.toEqual(loaded);
    expect(store.addFolder).toHaveBeenCalledWith(FOLDER);
    await call("remove-community-tool", TOOL_ID);
    expect(store.remove).toHaveBeenCalledWith(TOOL_ID);
    await call("grant-community-tool-consent", TOOL_ID);
    expect(store.grantConsent).toHaveBeenCalledWith(TOOL_ID);
  });

  it("returns null when the folder picker is cancelled", async () => {
    const { call, dialogs, store } = setup();
    dialogs.chooseFolder.mockResolvedValueOnce(null);

    await expect(call("add-community-tool-from-folder")).resolves.toBeNull();
    expect(store.addFolder).not.toHaveBeenCalled();
  });

  it("reads and writes storage for a loaded tool only", async () => {
    const { call, store } = setup();

    await expect(call("read-community-tool-storage", TOOL_ID)).resolves.toEqual({ count: 1 });
    await call("write-community-tool-storage", TOOL_ID, { count: 2 });
    expect(store.writeStorage).toHaveBeenCalledWith(TOOL_ID, { count: 2 });

    await expect(Promise.resolve().then(() => call("write-community-tool-storage", TOOL_ID, ["x"]))).rejects.toThrow(
      "Tool storage must be an object",
    );
    await expect(Promise.resolve().then(() => call("read-community-tool-storage", "contoso.unknown"))).rejects.toThrow(
      "Community tool not found",
    );
  });

  it("opens a file and returns its name and content, never the path", async () => {
    const { call, dialogs } = setup();
    const filters = [{ name: "CSV", extensions: ["csv"] }, { name: 3, extensions: "bad" }];

    const result = await call("open-file-for-community-tool", TOOL_ID, filters);

    expect(result).toEqual({ name: "accounts.csv", content: "name\nContoso" });
    expect(JSON.stringify(result)).not.toContain(resolve("/fake/docs"));
    expect(dialogs.chooseOpenFile).toHaveBeenCalledWith(expect.anything(), [{ name: "CSV", extensions: ["csv"] }]);
  });

  it("returns null when the open dialog is cancelled and an error above 20 MB", async () => {
    const { call, dialogs, files } = setup();
    dialogs.chooseOpenFile.mockResolvedValueOnce(null);
    await expect(call("open-file-for-community-tool", TOOL_ID, [])).resolves.toBeNull();

    files.size.mockResolvedValueOnce(20 * 1024 * 1024 + 1);
    await expect(call("open-file-for-community-tool", TOOL_ID, [])).resolves.toEqual({
      error: "File is larger than 20 MB",
    });
    expect(files.readText).not.toHaveBeenCalled();
  });

  it("saves a file under a suggested name without a directory", async () => {
    const { call, dialogs, files } = setup();

    await expect(call("save-file-for-community-tool", TOOL_ID, "../../secret/out.csv", "a,b")).resolves.toBe(true);
    expect(dialogs.chooseSaveFile).toHaveBeenCalledWith(expect.anything(), "out.csv");
    expect(files.writeText).toHaveBeenCalledWith(join(resolve("/fake/docs"), "out.csv"), "a,b");

    dialogs.chooseSaveFile.mockResolvedValueOnce(null);
    await expect(call("save-file-for-community-tool", TOOL_ID, "out.csv", "a,b")).resolves.toBe(false);
  });

  it("refuses to save a file for an unknown tool", async () => {
    const { call, dialogs } = setup();

    await expect(
      Promise.resolve().then(() => call("save-file-for-community-tool", "contoso.unknown", "out.csv", "a,b")),
    ).rejects.toThrow("Community tool not found");
    expect(dialogs.chooseSaveFile).not.toHaveBeenCalled();
  });
});
