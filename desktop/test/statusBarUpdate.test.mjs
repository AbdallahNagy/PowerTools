import { expect, test } from "vitest";

import {
  formatAppVersion,
  getReleaseUrl,
  getUpdateActionHint,
  getUpdateActionLabel,
  shouldPromptForUpdate,
} from "../src/ui/shell/layout/updateStatus.ts";

test("formats the app version from the actual app version value", () => {
  expect(formatAppVersion("0.1.0-beta.0")).toBe("v0.1.0-beta.0");
  expect(formatAppVersion("")).toBe("");
});

test("shows an update action only when the user can do something", () => {
  expect(getUpdateActionLabel({ state: "idle" })).toBe(null);
  expect(getUpdateActionLabel({ state: "available", version: "0.1.1" })).toBe("Update to v0.1.1");
  expect(getUpdateActionLabel({ state: "available" })).toBe("Update available");
  expect(getUpdateActionLabel({ state: "downloading", version: "0.1.1", percent: 44 })).toBe("Downloading 44%");
  expect(getUpdateActionLabel({ state: "downloaded", version: "0.1.1" })).toBe("Restart to update");
  expect(getUpdateActionLabel({ state: "error", message: "Network unavailable" })).toBe("Update failed");
});

test("explains what the update button does in each state", () => {
  expect(getUpdateActionHint({ state: "idle" })).toBe(null);
  expect(getUpdateActionHint({ state: "available", version: "0.1.1" })).toBe(
    "Power Tools v0.1.1 is available. Click to see what's new and update.",
  );
  expect(getUpdateActionHint({ state: "downloaded", version: "0.1.1" })).toBe(
    "Power Tools v0.1.1 is ready. Click to restart and install it.",
  );
  expect(getUpdateActionHint({ state: "error", message: "Network unavailable" })).toBe(
    "The update failed: Network unavailable. Click to try again.",
  );
});

test("prompts with the update dialog only when the user can act", () => {
  expect(shouldPromptForUpdate({ state: "available" })).toBe(true);
  expect(shouldPromptForUpdate({ state: "downloaded" })).toBe(true);
  expect(shouldPromptForUpdate({ state: "checking" })).toBe(false);
  expect(shouldPromptForUpdate({ state: "downloading", percent: 5 })).toBe(false);
  expect(shouldPromptForUpdate({ state: "error", message: "x" })).toBe(false);
});

test("links to the GitHub release for the new version", () => {
  expect(getReleaseUrl("0.2.0")).toBe("https://github.com/AbdallahNagy/PowerTools/releases/tag/v0.2.0");
  expect(getReleaseUrl(undefined)).toBe("https://github.com/AbdallahNagy/PowerTools/releases");
});
