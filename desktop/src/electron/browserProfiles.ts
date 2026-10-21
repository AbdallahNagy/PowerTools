import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";
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

export type BrowserPlatform = "win32" | "darwin" | "linux";

/** Where to look for browsers. Injected so tests can point at fixture folders. */
export interface BrowserEnvironment {
  platform: BrowserPlatform;
  /** Windows: %LOCALAPPDATA%. */
  localAppData: string;
  /** Windows: %APPDATA%. */
  appData: string;
  /** Windows: the Program Files folders. */
  programFiles: string[];
  /** macOS and Linux: the user's home folder. */
  home: string;
  /** Linux: the folders on PATH. */
  pathDirs: string[];
  /** Windows: reads the default value of an App Paths registry key, e.g. "chrome.exe". */
  readAppPath: (exeName: string) => Promise<string | null>;
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
}

interface BrowserSpec {
  id: BrowserId;
  name: string;
  windows: {
    exeName: string;
    /** Path segments under Program Files (or %LOCALAPPDATA%) to the executable. */
    installPath: string[];
    /** Path segments to the profile list: under %LOCALAPPDATA% for Chromium, %APPDATA% for Firefox. */
    profilesFile: string[];
  };
  mac: {
    /** The bundle in /Applications and the executable inside Contents/MacOS. */
    app: string;
    binary: string;
    /** Path segments under ~/Library/Application Support to the profile list. */
    profilesFile: string[];
  };
  linux: {
    /** Command names looked up on PATH. */
    commands: string[];
    /** Path segments under the home folder to the profile list, most likely first. */
    profilesFiles: string[][];
  };
}

const BROWSERS: BrowserSpec[] = [
  {
    id: "edge",
    name: "Microsoft Edge",
    windows: {
      exeName: "msedge.exe",
      installPath: ["Microsoft", "Edge", "Application", "msedge.exe"],
      profilesFile: ["Microsoft", "Edge", "User Data", "Local State"],
    },
    mac: {
      app: "Microsoft Edge.app",
      binary: "Microsoft Edge",
      profilesFile: ["Microsoft Edge", "Local State"],
    },
    linux: {
      commands: ["microsoft-edge", "microsoft-edge-stable"],
      profilesFiles: [[".config", "microsoft-edge", "Local State"]],
    },
  },
  {
    id: "chrome",
    name: "Google Chrome",
    windows: {
      exeName: "chrome.exe",
      installPath: ["Google", "Chrome", "Application", "chrome.exe"],
      profilesFile: ["Google", "Chrome", "User Data", "Local State"],
    },
    mac: {
      app: "Google Chrome.app",
      binary: "Google Chrome",
      profilesFile: ["Google", "Chrome", "Local State"],
    },
    linux: {
      commands: ["google-chrome", "google-chrome-stable"],
      profilesFiles: [[".config", "google-chrome", "Local State"]],
    },
  },
  {
    id: "brave",
    name: "Brave",
    windows: {
      exeName: "brave.exe",
      installPath: ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
      profilesFile: ["BraveSoftware", "Brave-Browser", "User Data", "Local State"],
    },
    mac: {
      app: "Brave Browser.app",
      binary: "Brave Browser",
      profilesFile: ["BraveSoftware", "Brave-Browser", "Local State"],
    },
    linux: {
      commands: ["brave-browser", "brave"],
      profilesFiles: [[".config", "BraveSoftware", "Brave-Browser", "Local State"]],
    },
  },
  {
    id: "firefox",
    name: "Mozilla Firefox",
    windows: {
      exeName: "firefox.exe",
      installPath: ["Mozilla Firefox", "firefox.exe"],
      profilesFile: ["Mozilla", "Firefox", "profiles.ini"],
    },
    mac: {
      app: "Firefox.app",
      binary: "firefox",
      profilesFile: ["Firefox", "profiles.ini"],
    },
    linux: {
      commands: ["firefox"],
      // The Ubuntu snap keeps its profiles inside the snap's own folder.
      profilesFiles: [
        [".mozilla", "firefox", "profiles.ini"],
        ["snap", "firefox", "common", ".mozilla", "firefox", "profiles.ini"],
      ],
    },
  },
];

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

async function findWindowsExecutable(
  env: BrowserEnvironment,
  { exeName, installPath }: BrowserSpec["windows"],
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

function firstExisting(env: BrowserEnvironment, candidates: string[]): string | null {
  return candidates.find((candidate) => env.fileExists(candidate)) ?? null;
}

/** The executable and profile list of one browser on this platform, if it is installed. */
async function locate(
  env: BrowserEnvironment,
  spec: BrowserSpec,
): Promise<{ executable: string; profilesFile: string | null } | null> {
  if (env.platform === "win32") {
    const executable = await findWindowsExecutable(env, spec.windows);
    const root = spec.id === "firefox" ? env.appData : env.localAppData;
    return executable ? { executable, profilesFile: join(root, ...spec.windows.profilesFile) } : null;
  }

  if (env.platform === "darwin") {
    // System-wide installs go to /Applications, per-user ones to ~/Applications.
    const executable = firstExisting(
      env,
      ["/Applications", join(env.home, "Applications")].map((folder) =>
        join(folder, spec.mac.app, "Contents", "MacOS", spec.mac.binary)),
    );
    const support = join(env.home, "Library", "Application Support");
    return executable ? { executable, profilesFile: join(support, ...spec.mac.profilesFile) } : null;
  }

  const executable = firstExisting(
    env,
    spec.linux.commands.flatMap((command) => env.pathDirs.map((folder) => join(folder, command))),
  );
  if (!executable) return null;
  const profilesFile = firstExisting(
    env,
    spec.linux.profilesFiles.map((segments) => join(env.home, ...segments)),
  );
  return { executable, profilesFile };
}

function readOr(env: BrowserEnvironment, path: string | null): string | null {
  if (!path) return null;
  try {
    return env.fileExists(path) ? env.readFile(path) : null;
  } catch {
    return null;
  }
}

/** Installed browsers and their profiles. Browsers that cannot be found are left out. */
export async function listInstalledBrowsers(env: BrowserEnvironment): Promise<InstalledBrowser[]> {
  const browsers: InstalledBrowser[] = [];

  for (const spec of BROWSERS) {
    const found = await locate(env, spec);
    if (!found) continue;
    const profiles = readOr(env, found.profilesFile);
    browsers.push({
      id: spec.id,
      name: spec.name,
      executable: found.executable,
      profiles: !profiles
        ? []
        : spec.id === "firefox"
          ? parseFirefoxProfiles(profiles)
          : parseChromiumProfiles(profiles),
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

/** The real browser locations on this computer, or null on a platform Power Tools does not support. */
export function systemBrowserEnvironment(
  platform: NodeJS.Platform = process.platform,
  vars: NodeJS.ProcessEnv = process.env,
): BrowserEnvironment | null {
  if (platform !== "win32" && platform !== "darwin" && platform !== "linux") return null;
  const programFiles = [vars.ProgramFiles, vars["ProgramFiles(x86)"]].filter(
    (value): value is string => Boolean(value),
  );
  return {
    platform,
    localAppData: vars.LOCALAPPDATA ?? "",
    appData: vars.APPDATA ?? "",
    programFiles,
    home: homedir(),
    pathDirs: (vars.PATH ?? "").split(delimiter).filter(Boolean),
    readAppPath: platform === "win32" ? readAppPathFromRegistry : async () => null,
    fileExists: existsSync,
    readFile: (path) => readFileSync(path, "utf-8"),
  };
}
