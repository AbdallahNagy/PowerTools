import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createBrowserLauncher, parseWebUrl } from "../../src/electron/browserLauncher";
import {
  browserArguments,
  listInstalledBrowsers,
  parseChromiumProfiles,
  parseFirefoxProfiles,
  type BrowserEnvironment,
  type InstalledBrowser,
} from "../../src/electron/browserProfiles";

const LOCAL = join("C:", "Users", "jo", "AppData", "Local");
const ROAMING = join("C:", "Users", "jo", "AppData", "Roaming");
const PROGRAM_FILES = join("C:", "Program Files");

const edgeLocalState = JSON.stringify({
  profile: {
    info_cache: {
      Default: { name: "Personal" },
      "Profile 1": { name: "Work" },
      "Profile 2": { name: "" },
    },
    profiles_order: ["Profile 1", "Default"],
  },
});

const firefoxIni = [
  "[Install308046B0AF4A39CB]",
  "Default=Profiles/abc.default-release",
  "",
  "[Profile1]",
  "Name=default",
  "IsRelative=1",
  "",
  "[Profile0]",
  "Name=Client A",
  "Path=Profiles/xyz.client-a",
  "",
  "[General]",
  "Name=not a profile",
].join("\r\n");

function environment(files: Record<string, string>, appPaths: Record<string, string> = {}): BrowserEnvironment {
  return {
    localAppData: LOCAL,
    appData: ROAMING,
    programFiles: [PROGRAM_FILES],
    readAppPath: async (exe) => appPaths[exe] ?? null,
    fileExists: (path) => path in files,
    readFile: (path) => files[path],
  };
}

describe("browser profiles", () => {
  it("reads Chromium profiles in the browser's own order", () => {
    expect(parseChromiumProfiles(edgeLocalState)).toEqual([
      { id: "Profile 1", name: "Work" },
      { id: "Default", name: "Personal" },
      { id: "Profile 2", name: "Profile 2" },
    ]);
    expect(parseChromiumProfiles("not json")).toEqual([]);
  });

  it("reads Firefox profiles by name", () => {
    expect(parseFirefoxProfiles(firefoxIni)).toEqual([
      { id: "default", name: "default" },
      { id: "Client A", name: "Client A" },
    ]);
  });

  it("finds installed browsers through App Paths or Program Files", async () => {
    const edgeExe = join(PROGRAM_FILES, "Microsoft", "Edge", "Application", "msedge.exe");
    const firefoxExe = join("D:", "Apps", "firefox.exe");
    const browsers = await listInstalledBrowsers(environment(
      {
        [edgeExe]: "",
        [join(LOCAL, "Microsoft", "Edge", "User Data", "Local State")]: edgeLocalState,
        [firefoxExe]: "",
        [join(ROAMING, "Mozilla", "Firefox", "profiles.ini")]: firefoxIni,
      },
      { "firefox.exe": firefoxExe },
    ));

    expect(browsers.map(({ id, executable, profiles }) => [id, executable, profiles.length])).toEqual([
      ["edge", edgeExe, 3],
      ["firefox", firefoxExe, 2],
    ]);
  });

  it("builds the command line for each browser", () => {
    expect(browserArguments({ id: "edge", profile: "Profile 1" }, "https://x.test/")).toEqual([
      "--profile-directory=Profile 1",
      "https://x.test/",
    ]);
    expect(browserArguments({ id: "chrome" }, "https://x.test/")).toEqual(["https://x.test/"]);
    expect(browserArguments({ id: "firefox", profile: "Client A" }, "https://x.test/")).toEqual([
      "-P",
      "Client A",
      "-new-tab",
      "https://x.test/",
    ]);
  });
});

describe("browser launcher", () => {
  const edge: InstalledBrowser = {
    id: "edge",
    name: "Microsoft Edge",
    executable: "msedge.exe",
    profiles: [{ id: "Default", name: "Personal" }, { id: "Profile 1", name: "Work" }],
  };

  function launcher(browsers: InstalledBrowser[] = [edge]) {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ChildProcess;
    const spawn = vi.fn(() => child);
    const openExternal = vi.fn(async () => undefined);
    const listBrowsers = vi.fn(async () => browsers);
    return { launcher: createBrowserLauncher({ listBrowsers, spawn, openExternal }), spawn, openExternal, listBrowsers, child };
  }

  it("opens the chosen profile", async () => {
    const { launcher: subject, spawn, openExternal } = launcher();
    await expect(subject.openUrl("https://x.test/a", { id: "edge", profile: "Profile 1" })).resolves.toEqual({ fallback: false });
    expect(spawn).toHaveBeenCalledWith("msedge.exe", ["--profile-directory=Profile 1", "https://x.test/a"]);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("uses the system browser when nothing is chosen", async () => {
    const { launcher: subject, spawn, openExternal } = launcher();
    await expect(subject.openUrl("https://x.test/", null)).resolves.toEqual({ fallback: false });
    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith("https://x.test/");
  });

  it.each([
    ["the browser is not installed", { id: "chrome" as const }],
    ["the profile is gone", { id: "edge" as const, profile: "Profile 9" }],
  ])("falls back to the system browser when %s", async (_case, choice) => {
    const { launcher: subject, spawn, openExternal } = launcher();
    await expect(subject.openUrl("https://x.test/", choice)).resolves.toEqual({ fallback: true });
    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith("https://x.test/");
  });

  it("falls back when the browser fails to start", async () => {
    const { launcher: subject, openExternal, child } = launcher();
    await subject.openUrl("https://x.test/", { id: "edge" });
    child.emit("error", new Error("ENOENT"));
    expect(openExternal).toHaveBeenCalledWith("https://x.test/");
  });

  it("refuses anything but web pages", async () => {
    const { launcher: subject, spawn, openExternal } = launcher();
    await expect(subject.openUrl("file:///C:/Windows/notepad.exe", { id: "edge" })).rejects.toThrow("Only HTTP and HTTPS");
    await expect(subject.openUrl(42, null)).rejects.toThrow("Only HTTP and HTTPS");
    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
    expect(() => parseWebUrl("javascript:alert(1)")).toThrow();
  });

  it("lists browsers without their executable paths and reads them once a minute", async () => {
    const { launcher: subject, listBrowsers } = launcher();
    expect(await subject.list()).toEqual([{ id: "edge", name: "Microsoft Edge", profiles: edge.profiles }]);
    await subject.list();
    expect(listBrowsers).toHaveBeenCalledTimes(1);
    subject.refresh();
    await subject.list();
    expect(listBrowsers).toHaveBeenCalledTimes(2);
  });
});
