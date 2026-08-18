import { expect, test } from "vitest";

import { readFileSync } from "node:fs";

import { configureAutoUpdates, shouldCheckForUpdates } from "../dist-electron/autoUpdate.js";

const builderConfig = JSON.parse(readFileSync(new URL("../electron-builder.json", import.meta.url), "utf8"));
const packageConfig = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("electron builder publishes update metadata to GitHub releases", () => {
  expect(builderConfig.publish).toEqual([
    {
      provider: "github",
      owner: "AbdallahNagy",
      repo: "PowerTools",
    },
  ]);
});

test("windows releases use the auto-updatable NSIS installer target", () => {
  expect(builderConfig.win.target).toEqual(["nsis"]);
  expect(builderConfig.win.artifactName).toBe("PowerTools-Setup.${ext}");
});

test("windows update installs use one-click NSIS flow", () => {
  expect(builderConfig.nsis.oneClick).toBe(true);
  expect(builderConfig.nsis.perMachine).toBe(false);
});

test("windows release script publishes installer and update metadata", () => {
  expect(packageConfig.scripts["release:win"]).toMatch(/electron-builder --win --x64 --publish always/);
});

test("update checks only run for packaged production builds", () => {
  expect(shouldCheckForUpdates({ isPackaged: true, isDevelopment: false })).toBe(true);
  expect(shouldCheckForUpdates({ isPackaged: false, isDevelopment: false })).toBe(false);
  expect(shouldCheckForUpdates({ isPackaged: true, isDevelopment: true })).toBe(false);
});

test("packaged production builds check for updates without auto-downloading", () => {
  const events = new Map();
  const statuses = [];
  let checkCount = 0;
  const updater = {
    autoDownload: true,
    on: (eventName, callback) => events.set(eventName, callback),
    checkForUpdates: () => {
      checkCount += 1;
      return Promise.resolve();
    },
    downloadUpdate: () => Promise.resolve(),
    quitAndInstall: () => {},
  };

  configureAutoUpdates({
    isPackaged: true,
    isDevelopment: false,
    updater,
    sendStatus: (status) => statuses.push(status),
  });

  expect(updater.autoDownload).toBe(false);
  expect(checkCount).toBe(1);
  expect(statuses.at(-1).state).toBe("checking");
  expect(events.has("update-available")).toBe(true);
  expect(events.has("update-downloaded")).toBe(true);
});

test("manual update actions are no-ops outside packaged production builds", async () => {
  let checkCount = 0;
  let downloadCount = 0;
  let installCount = 0;
  const updater = {
    autoDownload: true,
    on: () => {},
    checkForUpdates: () => {
      checkCount += 1;
      return Promise.resolve();
    },
    downloadUpdate: () => {
      downloadCount += 1;
      return Promise.resolve();
    },
    quitAndInstall: () => {
      installCount += 1;
    },
  };

  const controller = configureAutoUpdates({
    isPackaged: false,
    isDevelopment: false,
    updater,
    sendStatus: () => {},
  });

  await controller.checkForUpdates();
  await controller.downloadUpdate();
  controller.quitAndInstall();

  expect(checkCount).toBe(0);
  expect(downloadCount).toBe(0);
  expect(installCount).toBe(0);
});
