import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { createIsolatedUserDataDir } from "./isolatedUserData";

const desktopDir = fileURLToPath(new URL("../..", import.meta.url));
const mainWindowUrl = "http://localhost:5123/";
const connectionName = "Credential-free smoke";

const catalog = {
  assemblies: [{
    id: "10000000-0000-0000-0000-000000000001",
    name: "Smoke.Plugins",
    version: "1.0.0.0",
    culture: "neutral",
    publicKeyToken: "31bf3856ad364e35",
    sourceType: 0,
    isolationMode: 2,
    isManaged: false,
    isCustomizable: true,
    versionNumber: 1,
    description: "Credential-free test assembly",
    solutionDisplayName: "Smoke solution",
    handlers: [{
      id: "20000000-0000-0000-0000-000000000001",
      kind: 0,
      typeName: "Smoke.Plugins.AccountPlugin",
      name: "Account Plugin",
      friendlyName: null,
      description: "Smoke plug-in",
      workflowActivityGroupName: null,
      isManaged: false,
      isCustomizable: true,
      versionNumber: 2,
      steps: [{
        id: "30000000-0000-0000-0000-000000000001",
        pluginHandlerId: "20000000-0000-0000-0000-000000000001",
        name: "Account Update",
        description: "Smoke step",
        messageLabel: "Update",
        primaryTableLabel: "Account",
        secondaryTableLabel: null,
        stageLabel: "Post-operation",
        modeLabel: "Synchronous",
        stage: 40,
        mode: 0,
        rank: 1,
        isEnabled: true,
        isManaged: false,
        isCustomizable: true,
        versionNumber: 3,
        secureConfigExists: false,
        images: [{
          id: "40000000-0000-0000-0000-000000000001",
          pluginStepId: "30000000-0000-0000-0000-000000000001",
          name: "Needle Post Image",
          description: "Nested smoke image",
          imageTypeLabel: "Post Image",
          entityAlias: "Target",
          attributes: ["name"],
          isManaged: false,
          isCustomizable: true,
          versionNumber: 4,
          solutionDisplayName: "Smoke solution",
        }],
        solutionDisplayName: "Smoke solution",
      }],
      workflowArguments: [],
      dependencies: [],
      assemblyId: "10000000-0000-0000-0000-000000000001",
      solutionDisplayName: "Smoke solution",
    }],
  }],
};

test("browses Plugin Registration through the packaged preload without credentials", async () => {
  const isolatedUserData = await createIsolatedUserDataDir();
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | undefined;

  await writeFile(join(isolatedUserData.path, "connections.json"), JSON.stringify({
    connections: [{
      name: connectionName,
      envUrl: "https://credential-free-smoke.invalid",
      crmType: "online",
      homeAccountId: null,
    }],
    activeConnectionName: connectionName,
  }), "utf8");

  try {
    electronApp = await electron.launch({
      args: [
        `--user-data-dir=${isolatedUserData.path}`,
        "--host-resolver-rules=MAP localhost 127.0.0.1",
        ".",
      ],
      cwd: desktopDir,
      env: { ...process.env, NODE_ENV: "development" },
    });

    const electronUserDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    expect(resolve(electronUserDataPath)).toBe(resolve(isolatedUserData.path));

    await expect.poll(
      () => electronApp?.windows().some((window) => window.url() === mainWindowUrl),
      { timeout: 60_000 },
    ).toBe(true);
    const mainWindow = electronApp.windows().find((window) => window.url() === mainWindowUrl);
    expect(mainWindow).toBeDefined();
    if (!mainWindow) return;

    // Preserve the real sandboxed preload/IPC/shared-client path while replacing only
    // the external credential acquisition boundary with a non-secret smoke connection.
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("get-connection");
      ipcMain.handle("get-connection", (_event, name: string) => ({
        name,
        envUrl: "https://credential-free-smoke.invalid",
        crmType: "onpremise",
      }));
    });

    const intercepted: string[] = [];
    await mainWindow.route("**/api/plugin-registration/**", async (route) => {
      const url = new URL(route.request().url());
      intercepted.push(url.pathname);
      if (url.pathname.endsWith("/catalog")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) });
        return;
      }
      if (url.pathname.endsWith("/step-options")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [], filters: [], users: [] }) });
        return;
      }
      if (url.pathname.endsWith("/preflight")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
        return;
      }
      await route.abort("blockedbyclient");
    });

    await mainWindow.getByRole("button", {
      name: "Browse and safely manage Dataverse plug-in registrations",
    }).click();
    await expect(mainWindow.getByLabel("Connection")).toHaveValue(connectionName);
    await expect(mainWindow.getByRole("treeitem", { name: "Smoke.Plugins" })).toBeVisible();
    expect(intercepted).toContain("/api/plugin-registration/catalog");

    const assembly = mainWindow.getByRole("treeitem", { name: "Smoke.Plugins" });
    await assembly.click();
    await expect(assembly).toHaveAttribute("aria-selected", "true");
    await expect(assembly).toHaveAttribute("aria-expanded", "true");

    const plugin = mainWindow.getByRole("treeitem", { name: "(Plugin) Account Plugin" });
    await plugin.click();
    const step = mainWindow.getByRole("treeitem", { name: "(Step) Account Update" });
    await step.click();

    await mainWindow.getByRole("textbox", { name: "Search registrations" }).fill("Needle Post Image");
    const image = mainWindow.getByRole("treeitem", { name: "(Image) Needle Post Image" });
    await image.click();
    await expect(image).toHaveAttribute("aria-selected", "true");

    const details = mainWindow.getByRole("region", { name: "Registration details" });
    await expect(details.getByRole("heading", { name: "Needle Post Image" })).toBeVisible();
    await expect(details.getByText("Post Image", { exact: true })).toBeVisible();
    await expect(details.getByRole("button")).toHaveCount(0);

    await image.click({ button: "right" });
    await expect(mainWindow.getByRole("menuitem", { name: "Update image" })).toBeVisible();
    await mainWindow.keyboard.press("Escape");

    await image.dblclick();
    await expect(mainWindow.getByRole("dialog", { name: "Update image" })).toBeVisible();
  } finally {
    try {
      await electronApp?.close();
    } finally {
      await isolatedUserData.remove();
    }
  }

  expect(existsSync(isolatedUserData.path)).toBe(false);
});
