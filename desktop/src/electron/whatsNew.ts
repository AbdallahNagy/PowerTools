import type { UpdateDetails } from "./autoUpdate.js";
import { readSettings, writeSettings } from "./settings.js";

/** What the "What's new" panel shows once after the app was updated. */
export interface WhatsNew extends UpdateDetails {
  version: string;
  /** True only the first time the panel is shown on this install. */
  showStarPrompt: boolean;
}

function isUpdateDetails(value: unknown): value is UpdateDetails {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Keeps the release notes of a downloaded update. After the update installs and
 * the app restarts, the "What's new" panel shows them without going online.
 */
export function rememberDownloadedUpdate(details: UpdateDetails): void {
  if (!details.version) return;
  try {
    writeSettings({
      downloadedUpdate: {
        version: details.version,
        releaseName: details.releaseName,
        releaseDate: details.releaseDate,
        releaseNotes: details.releaseNotes,
      },
    });
  } catch (err) {
    console.error("Failed to remember the downloaded update:", err);
  }
}

/**
 * Called once per launch. Returns what to show when this launch is the first one
 * on a new version, or null. Records the current version so the panel appears
 * once per update. Never throws.
 */
export function takeWhatsNew({
  currentVersion,
  hasSavedConnections,
}: {
  currentVersion: string;
  hasSavedConnections: boolean;
}): WhatsNew | null {
  try {
    const settings = readSettings();
    const lastRunVersion = optionalString(settings.lastRunVersion);
    // Versions before this one did not record lastRunVersion. Saved connections
    // or settings mean the app ran before, so that launch counts as an update.
    const existingInstall = hasSavedConnections || Object.keys(settings).length > 0;
    const updated = lastRunVersion ? lastRunVersion !== currentVersion : existingInstall;
    const showStarPrompt = updated && settings.githubStarPromptShown !== true;

    // Undefined values drop the key, so the stored notes are used only once.
    writeSettings({
      lastRunVersion: currentVersion,
      downloadedUpdate: undefined,
      ...(showStarPrompt ? { githubStarPromptShown: true } : {}),
    });

    if (!updated) return null;

    const stored = isUpdateDetails(settings.downloadedUpdate) ? settings.downloadedUpdate : {};
    const notes = stored.version === currentVersion ? stored : {};
    return {
      version: currentVersion,
      releaseName: optionalString(notes.releaseName),
      releaseDate: optionalString(notes.releaseDate),
      releaseNotes: optionalString(notes.releaseNotes),
      showStarPrompt,
    };
  } catch (err) {
    console.error("Failed to read what's new:", err);
    return null;
  }
}
