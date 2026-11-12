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

/** Opens File > Community tools… the way the menu does. The menu is native, so its item is clicked from the main process. */
async function openManager(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "File");
    file?.submenu?.items.find((item) => item.label === "Community tools…")?.click();
  });
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

test("loads, reviews, allows and opens the reference tool through the Community tools dialog", async () => {
  await withApp(
    (userData) => seedCommunityTools(userData, []),
    async (app, window) => {
      // The folder picker is a native dialog; answer it with the reference tool's folder.
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
      }, referenceToolFolder);
      const nav = window.getByRole("navigation").locator("button", { hasText: "Attribute Explorer (reference)" });
      await expect(window.getByRole("heading", { level: 1, name: "PowerTools" })).toBeVisible();
      await expect(nav).toHaveCount(0);

      await openManager(app);
      const manager = window.getByRole("dialog", { name: "Community tools" });
      await expect(manager.getByText("No community tools are loaded")).toBeVisible({ timeout: 10_000 });

      await manager.getByRole("button", { name: /Load from folder/ }).click();
      await expect(manager.getByText("Attribute Explorer (reference)")).toBeVisible();
      await expect(manager.getByText("Needs review")).toBeVisible();
      // Until it is allowed the tool is not offered anywhere.
      await expect(nav).toHaveCount(0);

      await manager.getByRole("button", { name: "Review permissions for Attribute Explorer (reference)" }).click();
      const review = window.getByRole("dialog", { name: "Review permissions" });
      await expect(review.getByText("Read table definitions")).toBeVisible();
      await expect(review.getByText("No hosts declared")).toBeVisible();
      await expect(
        review.getByText("Power Tools limits which hosts a tool can call, but cannot fully block network access."),
      ).toBeVisible();
      await review.getByRole("button", { name: "Allow" }).click();
      await expect(review).toHaveCount(0);
      await expect(manager.getByText("Ready")).toBeVisible();

      await window.keyboard.press("Escape");
      await expect(manager).toHaveCount(0);
      await expect(nav).toBeVisible();
      await expect(nav.getByText("Local", { exact: true })).toBeVisible();

      await nav.click();
      await expect(window.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
      await expect(window.frameLocator("iframe").getByText("No environment selected")).toBeVisible({ timeout: 30_000 });
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
      let giveUp: NodeJS.Timeout | undefined;
      const answered = await Promise.race([
        frame?.evaluate(() => true).then(() => true),
        new Promise<boolean>((resolve) => {
          giveUp = setTimeout(() => resolve(false), 1_000);
        }),
      ]);
      clearTimeout(giveUp);
      expect(answered).toBe(false);

      // Another tool still opens, in its own tab.
      await window.getByRole("button", { name: "Build, run, and refine FetchXML queries" }).click({ timeout: 5_000 });
      await expect(window.locator('div[aria-label="FetchXML Builder"]')).toBeVisible({ timeout: 5_000 });

      // The File button opens a native menu that Playwright cannot see; a click that lands within the timeout
      // shows the shell still takes input.
      await window.getByRole("button", { name: "File" }).click({ timeout: 5_000 });

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

      await openManager(app);

      await expect(window.getByRole("dialog").getByText("Folder not found").first()).toBeVisible({ timeout: 10_000 });
    },
  );
});
