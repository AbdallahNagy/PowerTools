import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { shouldCheckForUpdates } from "../dist-electron/autoUpdate.js";

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

test("windows release script publishes installer and update metadata", () => {
  assert.match(packageConfig.scripts["release:win"], /electron-builder --win --x64 --publish always/);
});

test("update checks only run for packaged production builds", () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: true, isDevelopment: false }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: false, isDevelopment: false }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, isDevelopment: true }), false);
});
