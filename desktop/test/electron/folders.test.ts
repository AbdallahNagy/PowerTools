import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

import { registerFolderIpc, type FolderServices } from "../../src/electron/folders.ts";

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

function setup(overrides: Partial<FolderServices> = {}) {
  const handlers = new Map<string, Handler>();
  const window = { id: 1 };
  const services: FolderServices = {
    windowFor: () => window as never,
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ["C:\\src\\Model"] })),
    openPath: vi.fn(async () => ""),
    isDirectory: vi.fn(async () => true),
    ...overrides,
  };
  registerFolderIpc(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as never,
    services,
  );
  const event = { sender: {} };
  return {
    services,
    window,
    select: (...args: unknown[]) => handlers.get("select-directory")!(event, ...args),
    open: (...args: unknown[]) => handlers.get("open-path")!(event, ...args),
  };
}

describe("folder IPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a folder picker that can create folders and returns the chosen path", async () => {
    const { select, services, window } = setup();

    await expect(select("/home/user/src")).resolves.toBe("C:\\src\\Model");
    expect(services.showOpenDialog).toHaveBeenCalledWith(window, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: "/home/user/src",
    });
  });

  it("ignores a relative default path and returns null when cancelled", async () => {
    const { select, services } = setup({
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    });

    await expect(select("relative/folder")).resolves.toBeNull();
    expect(services.showOpenDialog).toHaveBeenCalledWith(expect.anything(), {
      properties: ["openDirectory", "createDirectory"],
    });
  });

  it("returns null without a dialog when the sender has no window", async () => {
    const { select, services } = setup({ windowFor: () => null });

    await expect(select()).resolves.toBeNull();
    expect(services.showOpenDialog).not.toHaveBeenCalled();
  });

  it("opens only absolute paths of existing folders", async () => {
    const { open, services } = setup();

    await expect(open("/home/user/src")).resolves.toEqual({ success: true });
    expect(services.openPath).toHaveBeenCalledWith("/home/user/src");

    await expect(open("relative")).resolves.toMatchObject({ success: false });
    await expect(open(42)).resolves.toMatchObject({ success: false });
    expect(services.openPath).toHaveBeenCalledTimes(1);
  });

  it("refuses a path that is not a folder and reports shell errors", async () => {
    const missing = setup({ isDirectory: vi.fn(async () => false) });
    await expect(missing.open("/home/user/file.txt")).resolves.toEqual({
      success: false,
      error: "The folder does not exist.",
    });
    expect(missing.services.openPath).not.toHaveBeenCalled();

    const failing = setup({ openPath: vi.fn(async () => "No application is associated.") });
    await expect(failing.open("/home/user/src")).resolves.toEqual({
      success: false,
      error: "No application is associated.",
    });
  });
});
