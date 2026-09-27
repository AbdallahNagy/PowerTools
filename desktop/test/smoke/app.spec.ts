import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { disposeElectronApp } from "./disposeElectron";
import { createIsolatedUserDataDir } from "./isolatedUserData";

const desktopDir = fileURLToPath(new URL("../..", import.meta.url));
const mainWindowUrl = "http://localhost:5123/";
const ELECTRON_LAUNCH_TIMEOUT_MS = 50_000;

test("launches the desktop app with an isolated profile and opens FetchXML Builder", async () => {
  const isolatedUserData = await createIsolatedUserDataDir();
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    electronApp = await Promise.race([
      electron.launch({
        args: [
          `--user-data-dir=${isolatedUserData.path}`,
          "--host-resolver-rules=MAP localhost 127.0.0.1",
          "--disable-gpu",
          ".",
        ],
        cwd: desktopDir,
        env: {
          ...process.env,
          NODE_ENV: "development",
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Electron launch timed out")),
          ELECTRON_LAUNCH_TIMEOUT_MS,
        );
      }),
    ]);

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
    await expect(mainWindow.getByRole("button", { name: "File" })).toBeVisible();
    await expect(mainWindow.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(mainWindow.getByRole("searchbox", { name: "Search tools" })).toBeVisible();

    await mainWindow
      .getByRole("button", { name: "Build, run, and refine FetchXML queries" })
      .click();

    await expect(
      mainWindow.locator("span.mr-2").filter({ hasText: /^FetchXML Builder$/ }),
    ).toBeVisible();
  } finally {
    await disposeElectronApp(electronApp, isolatedUserData.path);
    await isolatedUserData.remove();
  }

  expect(existsSync(isolatedUserData.path)).toBe(false);
});
