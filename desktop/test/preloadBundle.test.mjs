import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

test("selects a self-contained preload bundle for sandboxed windows", () => {
  const pathResolver = readFileSync("src/electron/pathResolver.ts", "utf8");
  const bundlePath = resolve("dist-electron/preload.bundle.cjs");

  expect(pathResolver).toMatch(/preload\.bundle\.cjs/);
  expect(existsSync(bundlePath)).toBe(true);
  expect(readFileSync(bundlePath, "utf8")).not.toMatch(
    /require\(["']\.\/preloadApi\.cjs["']\)/,
  );
});
