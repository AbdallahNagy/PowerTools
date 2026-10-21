import { createRequire } from "node:module";

import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const { needsAdHocSignature } = require("../packaging/afterPack.cjs");

test("ad-hoc signs macOS builds only when no signing certificate is set", () => {
  expect(needsAdHocSignature("darwin", {})).toBe(true);
  expect(needsAdHocSignature("darwin", { CSC_LINK: "" })).toBe(true);
  expect(needsAdHocSignature("darwin", { CSC_LINK: "base64-p12" })).toBe(false);
  expect(needsAdHocSignature("darwin", { CSC_NAME: "Developer ID" })).toBe(false);
  expect(needsAdHocSignature("linux", {})).toBe(false);
  expect(needsAdHocSignature("win32", {})).toBe(false);
});
