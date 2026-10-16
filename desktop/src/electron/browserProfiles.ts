import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { BrowserChoice, BrowserId } from "./connectionTypes.js";

export interface BrowserProfile {
  /** Chromium profile directory ("Default", "Profile 1") or Firefox profile name. */
  id: string;
  name: string;
}

export interface InstalledBrowser {
  id: BrowserId;
  name: string;
  executable: string;
  profiles: BrowserProfile[];
}

/** Where to look for browsers. Injected so tests can point at fixture folders. */
export interface BrowserEnvironment {
  localAppData: string;
  appData: string;
  programFiles: string[];
  /** Reads the default value of an App Paths registry key, e.g. "chrome.exe". */
  readAppPath: (exeName: string) => Promise<string | null>;
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
}

interface ChromiumSpec {
  id: Exclude<BrowserId, "firefox">;
  name: string;
  exeName: string;
  /** Path segments under %LOCALAPPDATA% to the "User Data" folder. */
  userData: string[];
  /** Path segments under Program Files to the executable. */
  installPath: string[];
}

const CHROMIUM: ChromiumSpec[] = [
  {
    id: "edge",
    name: "Microsoft Edge",
    exeName: "msedge.exe",
    userData: ["Microsoft", "Edge", "User Data"],
    installPath: ["Microsoft", "Edge", "Application", "msedge.exe"],
  },
  {
    id: "chrome",
    name: "Google Chrome",
    exeName: "chrome.exe",
    userData: ["Google", "Chrome", "User Data"],
    installPath: ["Google", "Chrome", "Application", "chrome.exe"],
  },
  {
    id: "brave",
    name: "Brave",
    exeName: "brave.exe",
    userData: ["BraveSoftware", "Brave-Browser", "User Data"],
    installPath: ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
  },
];

const FIREFOX = {
  name: "Mozilla Firefox",
  exeName: "firefox.exe",
  installPath: ["Mozilla Firefox", "firefox.exe"],
};

/** Reads Chromium's "Local State" file: profile directory → profile name. */
export function parseChromiumProfiles(localState: string): BrowserProfile[] {
  try {
    const parsed = JSON.parse(localState) as {
      profile?: { info_cache?: Record<string, { name?: unknown }>; profiles_order?: unknown };
    };
    const cache = parsed.profile?.info_cache ?? {};
    const order = Array.isArray(parsed.profile?.profiles_order)
      ? (parsed.profile.profiles_order as unknown[]).filter((id): id is string => typeof id === "string" && id in cache)
      : [];
    const ids = [...order, ...Object.keys(cache).filter((id) => !order.includes(id))];
    return ids.map((id) => {
      const name = cache[id]?.name;
      return { id, name: typeof name === "string" && name.trim() ? name : id };
    });
  } catch {
    return [];
  }
}

/** Reads Firefox's profiles.ini: one entry per [ProfileN] section with a Name. */
export function parseFirefoxProfiles(ini: string): BrowserProfile[] {
  const profiles: BrowserProfile[] = [];
  let inProfile = false;
  for (const rawLine of ini.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inProfile = /^\[Profile\d+\]$/i.test(line);
      continue;
    }
    const match = /^Name=(.+)$/.exec(line);
    if (inProfile && match) {
      const name = match[1].trim();
      if (name && !profiles.some((profile) => profile.id === name)) profiles.push({ id: name, name });
    }
  }
  return profiles;
}

async function findExecutable(
  env: BrowserEnvironment,
  exeName: string,
  installPath: string[],
): Promise<string | null> {
  const registered = await env.readAppPath(exeName).catch(() => null);
  if (registered && env.fileExists(registered)) return registered;
  for (const root of env.programFiles) {
    const candidate = join(root, ...installPath);
    if (env.fileExists(candidate)) return candidate;
  }
  // Per-user installs (Chrome without admin rights) live under %LOCALAPPDATA%.
  const perUser = join(env.localAppData, ...installPath);
  return env.fileExists(perUser) ? perUser : null;
}

function readOr(env: BrowserEnvironment, path: string): string | null {
  try {
    return env.fileExists(path) ? env.readFile(path) : null;
  } catch {
    return null;
  }
}

/** Installed browsers and their profiles. Browsers that cannot be found are left out. */
export async function listInstalledBrowsers(env: BrowserEnvironment): Promise<InstalledBrowser[]> {
  const browsers: InstalledBrowser[] = [];

  for (const spec of CHROMIUM) {
    const executable = await findExecutable(env, spec.exeName, spec.installPath);
    if (!executable) continue;
    const localState = readOr(env, join(env.localAppData, ...spec.userData, "Local State"));
    browsers.push({
      id: spec.id,
      name: spec.name,
      executable,
      profiles: localState ? parseChromiumProfiles(localState) : [],
    });
  }

  const firefox = await findExecutable(env, FIREFOX.exeName, FIREFOX.installPath);
  if (firefox) {
    const ini = readOr(env, join(env.appData, "Mozilla", "Firefox", "profiles.ini"));
    browsers.push({
      id: "firefox",
      name: FIREFOX.name,
      executable: firefox,
      profiles: ini ? parseFirefoxProfiles(ini) : [],
    });
  }

  return browsers;
}

/** Command-line arguments that open `url` in the chosen profile. */
export function browserArguments(browser: BrowserChoice, url: string): string[] {
  if (browser.id === "firefox") {
    return browser.profile ? ["-P", browser.profile, "-new-tab", url] : ["-new-tab", url];
  }
  return browser.profile ? [`--profile-directory=${browser.profile}`, url] : [url];
}

function readAppPathFromRegistry(exeName: string): Promise<string | null> {
  const keys = [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
  ];
  return keys.reduce<Promise<string | null>>(
    (found, key) =>
      found.then((value) =>
        value ??
        new Promise((resolve) => {
          execFile("reg", ["query", key, "/ve"], { windowsHide: true }, (error, stdout) => {
            if (error) {
              resolve(null);
              return;
            }
            const match = /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(stdout);
            resolve(match ? match[1].trim().replace(/^"|"$/g, "") : null);
          });
        })),
    Promise.resolve(null),
  );
}

/** The real Windows locations. Other platforms find no browsers and use the system default. */
export function windowsBrowserEnvironment(): BrowserEnvironment | null {
  if (process.platform !== "win32") return null;
  const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
    (value): value is string => Boolean(value),
  );
  return {
    localAppData: process.env.LOCALAPPDATA ?? "",
    appData: process.env.APPDATA ?? "",
    programFiles,
    readAppPath: readAppPathFromRegistry,
    fileExists: existsSync,
    readFile: (path) => readFileSync(path, "utf-8"),
  };
}
