export type UpdateDetails = {
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  releaseNotes?: string;
};

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | ({ state: "available" } & UpdateDetails)
  | ({ state: "downloading"; percent?: number } & UpdateDetails)
  | ({ state: "downloaded" } & UpdateDetails)
  | { state: "error"; message: string };

type ReleaseNoteInfo = {
  version?: string;
  note?: string | null;
};

type UpdateInfo = {
  version?: string;
  releaseName?: string | null;
  releaseDate?: string;
  releaseNotes?: string | ReleaseNoteInfo[] | null;
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

// electron-updater gives release notes as one string, or as one entry per
// version when several releases were skipped.
export function normalizeReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (typeof notes === "string") {
    return notes.trim() || undefined;
  }
  if (Array.isArray(notes)) {
    const joined = notes
      .filter((entry) => entry?.note)
      .map((entry) => (entry.version ? `<h3>${entry.version}</h3>${entry.note}` : entry.note))
      .join("\n");
    return joined || undefined;
  }
  return undefined;
}

function toUpdateDetails(info: UpdateInfo | undefined): UpdateDetails {
  return {
    version: info?.version,
    releaseName: info?.releaseName ?? undefined,
    releaseDate: info?.releaseDate,
    releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
  };
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

  // Download progress events carry no release info, so keep the details from
  // the last update-available event and repeat them in later statuses.
  let details: UpdateDetails = {};

  updater.on("checking-for-update", () => sendStatus({ state: "checking" }));
  updater.on("update-available", (info) => {
    details = toUpdateDetails(info as UpdateInfo);
    sendStatus({ state: "available", ...details });
  });
  updater.on("update-not-available", () => sendStatus({ state: "idle" }));
  updater.on("download-progress", (progress) => {
    const downloadProgress = progress as DownloadProgress;
    sendStatus({ state: "downloading", ...details, percent: downloadProgress?.percent });
  });
  updater.on("update-downloaded", (info) => {
    const downloaded = toUpdateDetails(info as UpdateInfo);
    details = {
      version: downloaded.version ?? details.version,
      releaseName: downloaded.releaseName ?? details.releaseName,
      releaseDate: downloaded.releaseDate ?? details.releaseDate,
      releaseNotes: downloaded.releaseNotes ?? details.releaseNotes,
    };
    sendStatus({ state: "downloaded", ...details });
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
