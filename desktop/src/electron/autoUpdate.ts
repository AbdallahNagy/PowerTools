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
  checkForUpdatesAndNotify,
}: {
  isPackaged: boolean;
  isDevelopment: boolean;
  checkForUpdatesAndNotify: () => Promise<unknown>;
}) {
  if (!shouldCheckForUpdates({ isPackaged, isDevelopment })) {
    return;
  }

  checkForUpdatesAndNotify().catch((err) => {
    console.error("Failed to check for updates:", err);
  });
}
