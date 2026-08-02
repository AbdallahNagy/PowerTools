import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("electron windows and renderer use the approved app icon", () => {
  const pathResolver = readFileSync("src/electron/pathResolver.ts", "utf8");
  const main = readFileSync("src/electron/main.ts", "utf8");
  const splash = readFileSync("src/electron/startupSplash.ts", "utf8");
  const index = readFileSync("index.html", "utf8");

  assert.match(pathResolver, /power-tools-preview-256\.png/);
  assert.match(main, /icon: getAppIconPath\(\)/);
  assert.match(splash, /icon: getAppIconPath\(\)/);
  assert.match(index, /src\/ui\/assets\/icons\/power-tools-preview-256\.png/);
});
