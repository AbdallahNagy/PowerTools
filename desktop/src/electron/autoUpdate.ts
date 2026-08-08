export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "downloading"; version?: string; percent?: number }
  | { state: "downloaded"; version?: string }
  | { state: "error"; message: string };

type UpdateInfo = {
  version?: string;
};

type DownloadProgress = {
  percent?: number;
};

export interface AutoUpdaterLike {
  autoDownload: boolean;
  on: (
    eventName:
      | "checking-for-update"
      | "update-available"
      | "update-not-available"
      | "download-progress"
      | "update-downloaded"
      | "error",
    callback: (...args: unknown[]) => void
  ) => void;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => void;
}

export interface AutoUpdateController {
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => void;
}

export function shouldCheckForUpdates({
  isPackaged,
  isDevelopment,
}: {
  isPackaged: boolean;
  isDevelopment: boolean;
}) {
  return isPackaged && !isDevelopment;
}

export function configureAutoUpdates({
  isPackaged,
  isDevelopment,
  updater,
  sendStatus,
}: {
  isPackaged: boolean;
  isDevelopment: boolean;
  updater: AutoUpdaterLike;
  sendStatus: (status: UpdateStatus) => void;
}): AutoUpdateController {
  if (!shouldCheckForUpdates({ isPackaged, isDevelopment })) {
    return {
      checkForUpdates: () => Promise.resolve(),
      downloadUpdate: () => Promise.resolve(),
      quitAndInstall: () => {},
    };
  }

  updater.autoDownload = false;

  updater.on("checking-for-update", () => sendStatus({ state: "checking" }));
  updater.on("update-available", (info) => {
    const updateInfo = info as UpdateInfo;
    sendStatus({ state: "available", version: updateInfo?.version });
  });
  updater.on("update-not-available", () => sendStatus({ state: "idle" }));
  updater.on("download-progress", (progress) => {
    const downloadProgress = progress as DownloadProgress;
    sendStatus({ state: "downloading", percent: downloadProgress?.percent });
  });
  updater.on("update-downloaded", (info) => {
    const updateInfo = info as UpdateInfo;
    sendStatus({ state: "downloaded", version: updateInfo?.version });
  });
  updater.on("error", (err) => {
    const error = err as Error;
    sendStatus({ state: "error", message: error.message });
  });

  const checkForUpdates = () => {
    sendStatus({ state: "checking" });
    return updater.checkForUpdates().catch((err) => {
      console.error("Failed to check for updates:", err);
      sendStatus({ state: "error", message: (err as Error).message });
    });
  };

  const downloadUpdate = () => updater.downloadUpdate().catch((err) => {
    console.error("Failed to download update:", err);
    sendStatus({ state: "error", message: (err as Error).message });
  });

  checkForUpdates();

  return {
    checkForUpdates,
    downloadUpdate,
    quitAndInstall: () => updater.quitAndInstall(),
  };
}
