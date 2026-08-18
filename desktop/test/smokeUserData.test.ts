import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { expect, test } from "vitest";

import { createIsolatedUserDataDir } from "./smoke/isolatedUserData";

test("creates and removes an isolated Electron profile under the OS temp directory", async () => {
  const isolatedUserData = await createIsolatedUserDataDir();
  const relativePath = relative(resolve(tmpdir()), resolve(isolatedUserData.path));

  try {
    expect(relativePath).not.toBe("");
    expect(relativePath).not.toBe("..");
    expect(relativePath.startsWith(`..${sep}`)).toBe(false);
    expect(isAbsolute(relativePath)).toBe(false);
    expect(existsSync(isolatedUserData.path)).toBe(true);

    writeFileSync(resolve(isolatedUserData.path, "cleanup-marker"), "smoke-only", "utf8");
  } finally {
    await isolatedUserData.remove();
  }

  expect(existsSync(isolatedUserData.path)).toBe(false);
});
