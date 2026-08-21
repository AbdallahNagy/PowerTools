import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createIsolatedUserDataDir } from "./isolatedUserData";

const desktopDir = fileURLToPath(new URL("../..", import.meta.url));
const mainWindowUrl = "http://localhost:5123/";

test("launches the desktop app with an isolated profile and opens FetchXML Builder", async () => {
  const isolatedUserData = await createIsolatedUserDataDir();
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    electronApp = await electron.launch({
      args: [
        `--user-data-dir=${isolatedUserData.path}`,
        "--host-resolver-rules=MAP localhost 127.0.0.1",
        ".",
      ],
      cwd: desktopDir,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
    });

    const electronUserDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    expect(resolve(electronUserDataPath)).toBe(resolve(isolatedUserData.path));

    await expect
      .poll(
        () => electronApp?.windows().some((window) => window.url() === mainWindowUrl),
        { timeout: 60_000 },
      )
      .toBe(true);

    const mainWindow = electronApp.windows().find((window) => window.url() === mainWindowUrl);
    expect(mainWindow).toBeDefined();
    if (!mainWindow) return;

    await expect(mainWindow.getByRole("heading", { level: 1, name: "PowerTools" })).toBeVisible();

    await mainWindow
      .getByRole("button", { name: "Build, run, and refine FetchXML queries" })
      .click();

    await expect(
      mainWindow.locator("span.mr-2").filter({ hasText: /^FetchXML Builder$/ }),
    ).toBeVisible();
  } finally {
    try {
      await electronApp?.close();
    } finally {
      await isolatedUserData.remove();
    }
  }

  expect(existsSync(isolatedUserData.path)).toBe(false);
});
