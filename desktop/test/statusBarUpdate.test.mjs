import { expect, test } from "vitest";

import {
  formatAppVersion,
  getUpdateActionLabel,
} from "../src/ui/components/layout/updateStatus.ts";

test("formats the app version from the actual app version value", () => {
  expect(formatAppVersion("0.1.0-beta.0")).toBe("v0.1.0-beta.0");
  expect(formatAppVersion("")).toBe("");
});

test("shows an update action only when the user can do something", () => {
  expect(getUpdateActionLabel({ state: "idle" })).toBe(null);
  expect(getUpdateActionLabel({ state: "available", version: "0.1.1" })).toBe("Update available");
  expect(getUpdateActionLabel({ state: "downloading", version: "0.1.1", percent: 44 })).toBe("Downloading 44%");
  expect(getUpdateActionLabel({ state: "downloaded", version: "0.1.1" })).toBe("Restart to update");
  expect(getUpdateActionLabel({ state: "error", message: "Network unavailable" })).toBe("Update failed");
});
