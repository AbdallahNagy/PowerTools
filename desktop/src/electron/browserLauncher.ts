import type { ChildProcess } from "child_process";
import { browserArguments, type InstalledBrowser } from "./browserProfiles.js";
import type { BrowserChoice } from "./connectionTypes.js";

export interface BrowserLauncherDeps {
  listBrowsers: () => Promise<InstalledBrowser[]>;
  spawn: (executable: string, args: string[]) => ChildProcess;
  openExternal: (url: string) => Promise<void>;
  /** How long the browser list is reused before it is read again. */
  cacheMs?: number;
  now?: () => number;
}

/** Only web pages may be opened; anything else could start a local program. */
export function parseWebUrl(url: unknown): string {
  if (typeof url !== "string") throw new Error("Only HTTP and HTTPS URLs can be opened.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs can be opened.");
  }
  return parsed.toString();
}

export function createBrowserLauncher({
  listBrowsers,
  spawn,
  openExternal,
  cacheMs = 60_000,
  now = Date.now,
}: BrowserLauncherDeps) {
  let cached: { at: number; browsers: Promise<InstalledBrowser[]> } | null = null;

  function browsers() {
    if (!cached || now() - cached.at > cacheMs) {
      cached = { at: now(), browsers: listBrowsers().catch(() => []) };
    }
    return cached.browsers;
  }

  return {
    /** Installed browsers, without executable paths, for the renderer. */
    async list() {
      return (await browsers()).map(({ id, name, profiles }) => ({ id, name, profiles }));
    },

    /**
     * Opens `url` in the chosen browser and profile. Falls back to the system
     * default browser when the choice is empty or no longer installed.
     */
    async openUrl(url: unknown, choice: BrowserChoice | null): Promise<{ fallback: boolean }> {
      const target = parseWebUrl(url);
      if (!choice) {
        await openExternal(target);
        return { fallback: false };
      }

      const browser = (await browsers()).find((candidate) => candidate.id === choice.id);
      const profileMissing =
        choice.profile !== undefined &&
        browser !== undefined &&
        browser.profiles.length > 0 &&
        !browser.profiles.some((profile) => profile.id === choice.profile);
      if (!browser || profileMissing) {
        await openExternal(target);
        return { fallback: true };
      }

      try {
        const child = spawn(browser.executable, browserArguments(choice, target));
        child.once("error", () => {
          void openExternal(target);
        });
        child.unref();
        return { fallback: false };
      } catch {
        await openExternal(target);
        return { fallback: true };
      }
    },

    /** Forgets the browser list, so a newly installed browser shows up. */
    refresh() {
      cached = null;
    },
  };
}

export type BrowserLauncher = ReturnType<typeof createBrowserLauncher>;
