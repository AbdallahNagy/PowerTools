import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAppVersion,
  getUpdateActionLabel,
} from "../src/ui/components/layout/updateStatus.ts";

test("formats the app version from the actual app version value", () => {
  assert.equal(formatAppVersion("0.1.0-beta.0"), "v0.1.0-beta.0");
  assert.equal(formatAppVersion(""), "");
});

test("shows an update action only when the user can do something", () => {
  assert.equal(getUpdateActionLabel({ state: "idle" }), null);
  assert.equal(
    getUpdateActionLabel({ state: "available", version: "0.1.1" }),
    "Update available"
  );
  assert.equal(
    getUpdateActionLabel({ state: "downloading", version: "0.1.1", percent: 44 }),
    "Downloading 44%"
  );
  assert.equal(
    getUpdateActionLabel({ state: "downloaded", version: "0.1.1" }),
    "Restart to update"
  );
  assert.equal(
    getUpdateActionLabel({ state: "error", message: "Network unavailable" }),
    "Update failed"
  );
});
