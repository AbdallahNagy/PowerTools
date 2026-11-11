import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

import { hangingToolFolder, referenceToolFolder, seedCommunityTools } from "./communityToolSeed";
import { createIsolatedUserDataDir } from "./isolatedUserData";

const desktopDir = fileURLToPath(new URL("../..", import.meta.url));
const mainWindowUrl = "http://localhost:5123/";

/** Launches the app with an isolated profile that `seed` may fill first, runs `body`, and always cleans up. */
async function withApp(
  seed: (userDataPath: string) => Promise<void>,
  body: (app: ElectronApplication, window: Page) => Promise<void>,
): Promise<void> {
  const isolatedUserData = await createIsolatedUserDataDir();
  let app: ElectronApplication | undefined;
  try {
    await seed(isolatedUserData.path);
    app = await electron.launch({
      args: [`--user-data-dir=${isolatedUserData.path}`, "--host-resolver-rules=MAP localhost 127.0.0.1", "."],
      cwd: desktopDir,
      env: { ...process.env, NODE_ENV: "development", SENTRY_DSN: "" },
    });
    const launched = app;
    await expect
      .poll(() => launched.windows().some((window) => window.url() === mainWindowUrl), { timeout: 60_000 })
      .toBe(true);
    const mainWindow = launched.windows().find((window) => window.url() === mainWindowUrl);
    if (!mainWindow) throw new Error("Main window not found");
    await body(launched, mainWindow);
  } finally {
    try {
      await app?.close();
    } finally {
      await isolatedUserData.remove();
    }
  }
}

function toolFrame(window: Page) {
  return window.frames().find((frame) => frame.url().startsWith("pt-tool://"));
}

test("loads the reference community tool in a sandboxed frame that follows the shell theme", async () => {
  await withApp(
    (userData) => seedCommunityTools(userData, [referenceToolFolder]),
    async (_app, window) => {
      const button = window.getByRole("navigation").locator("button", { hasText: "Attribute Explorer (reference)" });
      await expect(button).toBeVisible({ timeout: 30_000 });
      await expect(button.getByText("Local", { exact: true })).toBeVisible();

      await button.click();

      const iframe = window.locator("iframe");
      await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
      const src = await iframe.getAttribute("src");
      expect(src?.startsWith("pt-tool://powertools.attribute-explorer-reference/")).toBe(true);

      await expect(window.frameLocator("iframe").getByText("No environment selected")).toBeVisible({
        timeout: 30_000,
      });

      const shellTheme = await window.evaluate(() => document.documentElement.dataset.theme);
      expect(shellTheme).toBeTruthy();
      await expect
        .poll(async () => toolFrame(window)?.evaluate(() => document.documentElement.dataset.theme))
        .toBe(shellTheme);
    },
  );
});

test("a community tool stuck in an infinite loop leaves the shell responsive", async () => {
  await withApp(
    (userData) => seedCommunityTools(userData, [hangingToolFolder]),
    async (_app, window) => {
      const button = window.getByRole("navigation").locator("button", { hasText: "Hanging fixture" });
      await expect(button).toBeVisible({ timeout: 30_000 });
      await button.click();
      const tab = window.locator('div[aria-label="Hanging fixture"]');
      await expect(tab).toBeVisible();

      // The tool loops one second after the handshake; give it time to be stuck.
      await window.waitForTimeout(2_000);

      // Prove the loop is running: the frame no longer answers a trivial script.
      const frame = toolFrame(window);
      expect(frame).toBeDefined();
      const answered = await Promise.race([
        frame?.evaluate(() => true).then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
      ]);
      expect(answered).toBe(false);

      await window.getByRole("button", { name: "Build, run, and refine FetchXML queries" }).click({ timeout: 5_000 });
      await expect(window.locator("span.mr-2").filter({ hasText: /^FetchXML Builder$/ })).toBeVisible({
        timeout: 5_000,
      });

      const file = window.getByRole("button", { name: "File" });
      await file.click({ timeout: 5_000 });
      await expect(file).toBeVisible();

      // The shell stays in control of the hung tool: its tab is listed and can be closed.
      await expect(tab).toBeVisible();
      await tab.hover();
      await tab.locator("button").click({ timeout: 5_000 });
      await expect(tab).toHaveCount(0, { timeout: 5_000 });
    },
  );
});

test("starts with a missing tool folder and lists it as not found", async () => {
  const missingFolder = "C:\\power-tools-smoke-does-not-exist\\tool";
  await withApp(
    (userData) => seedCommunityTools(userData, [missingFolder], []),
    async (app, window) => {
      await expect(window.getByRole("heading", { level: 1, name: "PowerTools" })).toBeVisible();

      // The File menu is native, so click its real menu item from the main process.
      await app.evaluate(({ Menu }) => {
        const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
        file?.submenu?.items.find((item) => item.label === "Community tools…")?.click();
      });

      await expect(window.getByRole("dialog").getByText("Folder not found").first()).toBeVisible({ timeout: 10_000 });
    },
  );
});
