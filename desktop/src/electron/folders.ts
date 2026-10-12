import { stat } from "node:fs/promises";
import path from "node:path";
import {
  BrowserWindow,
  dialog,
  shell,
  type IpcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
} from "electron";

export interface FolderServices {
  windowFor(event: IpcMainInvokeEvent): BrowserWindow | null;
  showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
  openPath(target: string): Promise<string>;
  isDirectory(target: string): Promise<boolean>;
}

export interface FolderOperationResult {
  success: boolean;
  error?: string;
}

export function electronFolderServices(): FolderServices {
  return {
    windowFor(event) {
      const window = BrowserWindow.fromWebContents(event.sender);
      return window && !window.isDestroyed() ? window : null;
    },
    showOpenDialog: (window, options) => dialog.showOpenDialog(window, options),
    openPath: (target) => shell.openPath(target),
    async isDirectory(target) {
      try {
        return (await stat(target)).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

/**
 * Native folder picker and "open in the file manager", for tools that write files to disk.
 * Only absolute paths of existing folders are opened, so the renderer cannot launch files.
 */
export function registerFolderIpc(
  ipcMain: Pick<IpcMain, "handle">,
  services: FolderServices = electronFolderServices(),
): void {
  ipcMain.handle("select-directory", async (event, defaultPath: unknown): Promise<string | null> => {
    const window = services.windowFor(event);
    if (!window) return null;

    const options: OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] };
    if (typeof defaultPath === "string" && path.isAbsolute(defaultPath)) {
      options.defaultPath = defaultPath;
    }

    const result = await services.showOpenDialog(window, options);
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("open-path", async (event, target: unknown): Promise<FolderOperationResult> => {
    if (!services.windowFor(event)) return { success: false, error: "The request did not come from an app window." };
    if (typeof target !== "string" || !path.isAbsolute(target)) {
      return { success: false, error: "Only a full folder path can be opened." };
    }
    if (!(await services.isDirectory(target))) {
      return { success: false, error: "The folder does not exist." };
    }

    const error = await services.openPath(target);
    return error ? { success: false, error } : { success: true };
  });
}
