// IPC for community tools: the main window lists, adds, and removes tools, grants
// consent, and reads storage and files on a tool's behalf. File results carry
// content only, never a path.
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type { ToolStore } from "./toolStore.js";

const MAX_OPEN_FILE_BYTES = 20 * 1024 * 1024;

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface CommunityToolIpcDeps {
  ipcMain: Pick<IpcMain, "handle">;
  store: ToolStore;
  getMainWindow: () => BrowserWindow | null;
  dialogs: {
    chooseFolder(window: BrowserWindow): Promise<string | null>;
    chooseOpenFile(window: BrowserWindow, filters: FileFilter[]): Promise<string | null>;
    chooseSaveFile(window: BrowserWindow, suggestedName: string): Promise<string | null>;
  };
  files: {
    size(path: string): Promise<number>;
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keeps well-formed filters with plain extensions such as "csv"; drops the rest. */
export function parseFileFilters(value: unknown): FileFilter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): FileFilter[] => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !Array.isArray(entry.extensions)) return [];
    const extensions = entry.extensions.filter(
      (ext): ext is string => typeof ext === "string" && /^([A-Za-z0-9]+|\*)$/.test(ext),
    );
    return extensions.length > 0 ? [{ name: entry.name, extensions }] : [];
  });
}

/** The last segment of a suggested name, so a tool cannot point the dialog at a folder. */
function plainFileName(value: unknown): string {
  const name = typeof value === "string" ? (value.split(/[\\/]/).pop() ?? "") : "";
  return name.trim() || "untitled.txt";
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

export function registerCommunityToolIpc({ ipcMain, store, getMainWindow, dialogs, files }: CommunityToolIpcDeps) {
  function mainWindowFor(event: IpcMainInvokeEvent): BrowserWindow {
    const window = getMainWindow();
    if (!window || event.sender !== window.webContents) {
      throw new Error("Community tool calls are only accepted from the main window");
    }
    return window;
  }

  /** The id of a ready tool, or throws. */
  function readyToolId(id: unknown): string {
    if (typeof id !== "string" || store.manifestFor(id) === null) throw new Error("Community tool not found");
    return id;
  }

  ipcMain.handle("list-community-tools", (event) => {
    mainWindowFor(event);
    return store.list();
  });

  ipcMain.handle("add-community-tool-from-folder", async (event) => {
    const folder = await dialogs.chooseFolder(mainWindowFor(event));
    return folder ? store.addFolder(folder) : null;
  });

  ipcMain.handle("remove-community-tool", async (event, id: unknown) => {
    mainWindowFor(event);
    const tools = await store.list();
    if (typeof id !== "string" || !tools.some((tool) => tool.id === id)) throw new Error("Community tool not found");
    await store.remove(id);
  });

  ipcMain.handle("grant-community-tool-consent", (event, id: unknown) => {
    mainWindowFor(event);
    return store.grantConsent(readyToolId(id));
  });

  ipcMain.handle("read-community-tool-storage", (event, id: unknown) => {
    mainWindowFor(event);
    return store.readStorage(readyToolId(id));
  });

  ipcMain.handle("write-community-tool-storage", (event, id: unknown, data: unknown) => {
    mainWindowFor(event);
    const toolId = readyToolId(id);
    if (!isRecord(data)) throw new Error("Tool storage must be an object");
    return store.writeStorage(toolId, data);
  });

  ipcMain.handle("open-file-for-community-tool", async (event, id: unknown, filters: unknown) => {
    const window = mainWindowFor(event);
    readyToolId(id);
    const path = await dialogs.chooseOpenFile(window, parseFileFilters(filters));
    if (!path) return null;
    if ((await files.size(path)) > MAX_OPEN_FILE_BYTES) return { error: "File is larger than 20 MB" };
    return { name: fileNameOf(path), content: await files.readText(path) };
  });

  ipcMain.handle(
    "save-file-for-community-tool",
    async (event, id: unknown, suggestedName: unknown, content: unknown) => {
      const window = mainWindowFor(event);
      readyToolId(id);
      if (typeof content !== "string") throw new Error("File content must be text");
      const path = await dialogs.chooseSaveFile(window, plainFileName(suggestedName));
      if (!path) return false;
      await files.writeText(path, content);
      return true;
    },
  );
}
