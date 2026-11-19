import type { ChildProcess } from "child_process";
import { browserArguments, type InstalledBrowser } from "./browserProfiles.js";
import type { BrowserChoice } from "./connectionTypes.js";

export interface BrowserLauncherDeps {
  listBrowsers: () => Promise<InstalledBrowser[]>;
  spawn: (executable: string, args: string[]) => ChildProcess;
  openExternal: (url: string) => Promise<void>;
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
}: BrowserLauncherDeps) {
  // The browser list is read once and kept. It is read again only when asked
  // (a connection changed, or a form lists the browsers).
  let reading: Promise<InstalledBrowser[]> | null = null;
  // The last list that finished reading. Opening a page uses it while a newer
  // list is being read, so a click does not wait on the registry scan.
  let lastKnown: InstalledBrowser[] | null = null;

  function scan() {
    const current = listBrowsers().catch(() => []);
    reading = current;
    void current.then((list) => {
      if (reading === current) lastKnown = list;
    });
    return current;
  }

  function browsers() {
    return reading ?? scan();
  }

  /** The chosen browser, or null when it or its profile is not installed. */
  function match(list: InstalledBrowser[], choice: BrowserChoice) {
    const browser = list.find((candidate) => candidate.id === choice.id);
    if (!browser) return null;
    const profileMissing =
      choice.profile !== undefined &&
      browser.profiles.length > 0 &&
      !browser.profiles.some((profile) => profile.id === choice.profile);
    return profileMissing ? null : browser;
  }

  /** Uses the last list, and waits for a newer one only when the last one lacks the choice. */
  async function findBrowser(choice: BrowserChoice) {
    return (lastKnown && match(lastKnown, choice)) ?? match(await browsers(), choice);
  }

  return {
    /** Starts reading the browser list so the first open does not wait for it. */
    warm() {
      void browsers();
    },

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

      const browser = await findBrowser(choice);
      if (!browser) {
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

    /** Reads the browser list again, so a newly installed browser or profile shows up. */
    refresh() {
      void scan();
    },
  };
}

export type BrowserLauncher = ReturnType<typeof createBrowserLauncher>;
