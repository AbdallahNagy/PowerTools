import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { configureAutoUpdates, shouldCheckForUpdates } from "../dist-electron/autoUpdate.js";

const builderConfig = JSON.parse(readFileSync(new URL("../electron-builder.json", import.meta.url), "utf8"));
const packageConfig = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("electron builder publishes update metadata to GitHub releases", () => {
  assert.deepEqual(builderConfig.publish, [
    {
      provider: "github",
      owner: "AbdallahNagy",
      repo: "PowerTools",
    },
  ]);
});

test("windows releases use the auto-updatable NSIS installer target", () => {
  assert.deepEqual(builderConfig.win.target, ["nsis"]);
  assert.equal(builderConfig.win.artifactName, "PowerTools-Setup.${ext}");
});

test("windows update installs use one-click NSIS flow", () => {
  assert.equal(builderConfig.nsis.oneClick, true);
  assert.equal(builderConfig.nsis.perMachine, false);
});

test("windows release script publishes installer and update metadata", () => {
  assert.match(packageConfig.scripts["release:win"], /electron-builder --win --x64 --publish always/);
});

test("update checks only run for packaged production builds", () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: true, isDevelopment: false }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: false, isDevelopment: false }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, isDevelopment: true }), false);
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

  assert.equal(updater.autoDownload, false);
  assert.equal(checkCount, 1);
  assert.equal(statuses.at(-1).state, "checking");
  assert.equal(events.has("update-available"), true);
  assert.equal(events.has("update-downloaded"), true);
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

  assert.equal(checkCount, 0);
  assert.equal(downloadCount, 0);
  assert.equal(installCount, 0);
});
