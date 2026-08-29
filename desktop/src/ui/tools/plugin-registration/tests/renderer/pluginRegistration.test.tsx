import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConnectionsProvider } from "../../../../shared/connections";
import { renderWithProviders } from "../../../../../../test/support/render";
import { httpServer } from "../../../../../../test/support/httpServer";
import PluginRegistration from "../../PluginRegistration";
import { pluginRegistrationTool } from "../../tool";
import type { PluginRegistrationCatalogDto } from "../../model/contracts";

const originalResizeObserver = window.ResizeObserver;

beforeAll(() => {
  class TestResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = TestResizeObserver;
});

afterAll(() => {
  if (originalResizeObserver) window.ResizeObserver = originalResizeObserver;
  else Reflect.deleteProperty(window, "ResizeObserver");
});

const developmentCatalog: PluginRegistrationCatalogDto = {
  assemblies: [
    {
      id: "assembly-1",
      name: "Contoso.Plugins",
      version: "1.2.3.4",
      culture: "neutral",
      publicKeyToken: "31bf3856ad364e35",
      sourceType: 0,
      isolationMode: 2,
      isManaged: false,
      isCustomizable: true,
      versionNumber: 10,
      description: "Shared business logic",
      solutionDisplayName: "Core solution",
      handlers: [
        {
          id: "plugin-1",
          kind: 0,
          typeName: "Contoso.Plugins.AccountPlugin",
          name: "Account Plugin",
          friendlyName: "Account processing",
          description: "Runs on account updates",
          workflowActivityGroupName: null,
          isManaged: false,
          isCustomizable: true,
          versionNumber: 11,
          steps: [
            {
              id: "step-1",
              pluginHandlerId: "plugin-1",
              name: "Account Update",
              description: "Update step",
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
              versionNumber: 12,
              secureConfigExists: false,
              images: [
                {
                  id: "image-1",
                  pluginStepId: "step-1",
                  name: "Account Target",
                  description: "Target image",
                  imageTypeLabel: "Post Image",
                  entityAlias: "Target",
                  attributes: ["name", "accountnumber"],
                  isManaged: false,
                  isCustomizable: true,
                  versionNumber: 13,
                  solutionDisplayName: "Core solution",
                },
              ],
              solutionDisplayName: "Core solution",
            },
          ],
          workflowArguments: [],
          dependencies: [],
          assemblyId: "assembly-1",
          solutionDisplayName: "Core solution",
        },
        {
          id: "workflow-1",
          kind: 1,
          typeName: "Contoso.Plugins.ValidateAccount",
          name: "Validate Account",
          friendlyName: null,
          description: "Validates an account",
          workflowActivityGroupName: "Account Automation",
          isManaged: false,
          isCustomizable: true,
          versionNumber: 14,
          steps: [],
          workflowArguments: [
            {
              name: "Account",
              displayName: "Account",
              typeName: "Microsoft.Xrm.Sdk.EntityReference",
              direction: 0,
              isRequired: true,
              position: 0,
            },
          ],
          dependencies: [],
          assemblyId: "assembly-1",
          solutionDisplayName: "Core solution",
        },
      ],
    },
  ],
};

const productionCatalog: PluginRegistrationCatalogDto = {
  assemblies: [
    {
      ...developmentCatalog.assemblies[0]!,
      id: "assembly-2",
      name: "Fabrikam.Plugins",
      handlers: [],
    },
  ],
};

function renderPluginRegistration(activeConnectionName: string | null = "Development") {
  return renderWithProviders(
    <ConnectionsProvider>
      <PluginRegistration />
    </ConnectionsProvider>,
    {
      bridgeOverrides: {
        listConnections: async () => [
          {
            name: "Development",
            envUrl: "https://development.example.test",
            crmType: "online",
          },
          {
            name: "Production",
            envUrl: "https://production.example.test",
            crmType: "online",
          },
        ],
        getActiveConnectionName: async () => activeConnectionName,
        getConnection: async (name) => ({
          name,
          envUrl: `https://${name.toLowerCase()}.example.test`,
          crmType: "online",
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      },
    },
  );
}

function useCatalogResponse(catalog: PluginRegistrationCatalogDto = developmentCatalog) {
  httpServer.use(
    http.get("http://localhost/api/plugin-registration/catalog", () =>
      HttpResponse.json(catalog),
    ),
  );
}

async function waitForCatalog() {
  await screen.findByRole("treeitem", { name: "Contoso.Plugins" });
}

describe("Plugin Registration workspace", () => {
  it("renders the connection header, accessible refresh, registration action, and two-thirds workspace", async () => {
    useCatalogResponse();
    let requestCount = 0;
    let releaseRefresh: (() => void) | undefined;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", async () => {
        requestCount += 1;
        if (requestCount === 2) {
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
        }
        return HttpResponse.json(developmentCatalog);
      }),
    );
    renderPluginRegistration();

    expect(pluginRegistrationTool.tooltip).toBe(
      "Browse and safely manage Dataverse plug-in registrations",
    );
    await waitFor(() => expect(screen.getByLabelText("Connection")).toHaveValue("Development"));
    await waitForCatalog();
    const refresh = screen.getByRole("button", { name: "Refresh registrations" });
    expect(refresh).toBeEnabled();
    expect(screen.getByRole("button", { name: "Register assembly" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Registration hierarchy" }).style.flexGrow).toBe(
      "66.666",
    );

    fireEvent.click(refresh);
    await waitFor(() => expect(requestCount).toBe(2));
    expect(refresh).toBeDisabled();
    releaseRefresh?.();
    await waitFor(() => expect(refresh).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Register assembly" }));
    expect(screen.getByRole("dialog", { name: "Register assembly" })).toBeInTheDocument();
  });

  it("disables refresh without a selected connection and describes what to do next", async () => {
    renderPluginRegistration(null);

    expect(await screen.findByLabelText("Connection")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Refresh registrations" })).toBeDisabled();
    expect(screen.getByText("Select a connection to browse registrations.")).toBeInTheDocument();
  });

  it("shows loading, error, catalog-empty, and search-empty states", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", async () => {
        await delay("infinite");
        return HttpResponse.json(developmentCatalog);
      }),
    );
    const first = renderPluginRegistration();
    expect(await screen.findByText("Loading registrations…")).toBeInTheDocument();
    first.unmount();

    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json({ message: "Catalog unavailable" }, { status: 503 }),
      ),
    );
    const second = renderPluginRegistration();
    expect(await screen.findByText(/Catalog unavailable/i)).toBeInTheDocument();
    second.unmount();

    useCatalogResponse({ assemblies: [] });
    const third = renderPluginRegistration();
    expect(await screen.findByText("No registrations found.")).toBeInTheDocument();
    third.unmount();

    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();
    fireEvent.change(screen.getByRole("textbox", { name: "Search registrations" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No registrations match your search.")).toBeInTheDocument();
  });

  it("searches the direct hierarchy and exposes restrained prefixes and tree metadata", async () => {
    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();

    const assembly = screen.getByRole("treeitem", { name: "Contoso.Plugins" });
    expect(assembly).toHaveAttribute("aria-level", "1");
    expect(assembly).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Plug-ins")).not.toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: "Search registrations" });
    fireEvent.change(search, { target: { value: "accountnumber" } });

    expect(screen.getByRole("treeitem", { name: "Contoso.Plugins" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" })).toHaveAttribute(
      "aria-level",
      "2",
    );
    expect(screen.getByRole("treeitem", { name: "(Step) Account Update" })).toHaveAttribute(
      "aria-level",
      "3",
    );
    expect(screen.getByRole("treeitem", { name: "(Image) Account Target" })).toHaveAttribute(
      "aria-level",
      "4",
    );
    expect(
      screen.queryByRole("treeitem", { name: "(Workflow Activity) Validate Account" }),
    ).not.toBeInTheDocument();
  });

  it("selects and immediately expands once on click while double click opens the node shell", async () => {
    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();

    const assembly = screen.getByRole("treeitem", { name: "Contoso.Plugins" });
    fireEvent.click(assembly, { detail: 1 });
    expect(assembly).toHaveAttribute("aria-selected", "true");
    expect(assembly).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Contoso.Plugins" })).toBeInTheDocument();

    const plugin = screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" });
    fireEvent.click(plugin, { detail: 1 });
    fireEvent.click(plugin, { detail: 2 });
    fireEvent.doubleClick(plugin, { detail: 2 });
    expect(plugin).toHaveAttribute("aria-selected", "true");
    expect(plugin).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Update plug-in" })).toBeInTheDocument();
  });

  it.each([
    ["Contoso.Plugins", ["Update assembly", "Unregister assembly"]],
    ["(Plugin) Account Plugin", ["Register step", "Unregister plug-in"]],
    [
      "(Step) Account Update",
      ["Update step", "Register image", "Disable step", "Unregister step"],
    ],
    ["(Image) Account Target", ["Update image", "Unregister image"]],
    [
      "(Workflow Activity) Validate Account",
      ["Update workflow activity", "Unregister workflow activity"],
    ],
  ])("shows the typed context menu for %s", async (nodeName, expectedItems) => {
    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();

    const assembly = screen.getByRole("treeitem", { name: "Contoso.Plugins" });
    if (nodeName !== "Contoso.Plugins") fireEvent.click(assembly, { detail: 1 });
    if (nodeName.includes("Step") || nodeName.includes("Image")) {
      fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }), {
        detail: 1,
      });
    }
    if (nodeName.includes("Image")) {
      fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Account Update" }), {
        detail: 1,
      });
    }

    const node = screen.getByRole("treeitem", { name: nodeName });
    fireEvent.contextMenu(node, { clientX: 99999, clientY: 99999 });
    const menu = screen.getByRole("menu", { name: `${nodeName} actions` });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(
      expectedItems,
    );
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();
    expect(Number.parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
  });

  it("dismisses context menus with Escape or an outside click and restores node focus", async () => {
    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();

    const assembly = screen.getByRole("treeitem", { name: "Contoso.Plugins" });
    fireEvent.contextMenu(assembly, { clientX: 20, clientY: 20 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(assembly).toHaveFocus();

    fireEvent.contextMenu(assembly, { clientX: 20, clientY: 20 });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders type-specific read-only details without mutation buttons", async () => {
    useCatalogResponse();
    renderPluginRegistration();
    await waitForCatalog();

    fireEvent.click(screen.getByRole("treeitem", { name: "Contoso.Plugins" }), { detail: 1 });
    fireEvent.click(screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" }), {
      detail: 1,
    });
    fireEvent.click(screen.getByRole("treeitem", { name: "(Step) Account Update" }), {
      detail: 1,
    });

    const details = screen.getByRole("region", { name: "Registration details" });
    expect(within(details).getByRole("heading", { name: "Account Update" })).toBeInTheDocument();
    expect(within(details).getByText("Post-operation")).toBeInTheDocument();
    expect(within(details).getByText("Synchronous")).toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: /unregister/i })).not.toBeInTheDocument();
  });

  it("clears old selection, expansion, menu, and dialog before a new connection renders", async () => {
    let productionRequested = false;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", async ({ request }) => {
        if (request.headers.get("X-Environment-Url")?.includes("production")) {
          productionRequested = true;
          await delay("infinite");
          return HttpResponse.json(productionCatalog);
        }
        return HttpResponse.json(developmentCatalog);
      }),
    );
    renderPluginRegistration();
    await waitForCatalog();

    const assembly = screen.getByRole("treeitem", { name: "Contoso.Plugins" });
    fireEvent.click(assembly, { detail: 1 });
    const plugin = screen.getByRole("treeitem", { name: "(Plugin) Account Plugin" });
    fireEvent.click(plugin, { detail: 1 });
    fireEvent.click(plugin, { detail: 2 });
    fireEvent.doubleClick(plugin, { detail: 2 });
    fireEvent.contextMenu(assembly, { clientX: 20, clientY: 20 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Update plug-in" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Connection"), { target: { value: "Production" } });
    await waitFor(() => expect(productionRequested).toBe(true));

    expect(screen.queryByRole("treeitem", { name: "Contoso.Plugins" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Loading registrations…")).toBeInTheDocument();
    expect(screen.getByText("Select a registration to view details.")).toBeInTheDocument();
  });
});
