import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

test("electron windows and renderer use the approved app icon", () => {
  const pathResolver = readFileSync("src/electron/pathResolver.ts", "utf8");
  const main = readFileSync("src/electron/main.ts", "utf8");
  const splash = readFileSync("src/electron/startupSplash.ts", "utf8");
  const index = readFileSync("index.html", "utf8");

  expect(pathResolver).toMatch(/power-tools-preview-256\.png/);
  expect(main).toMatch(/icon: getAppIconPath\(\)/);
  expect(splash).toMatch(/icon: getAppIconPath\(\)/);
  expect(index).toMatch(/src\/ui\/assets\/icons\/power-tools-preview-256\.png/);
});
