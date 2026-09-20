import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import {
  StatusBarProvider,
  useStatusItems,
} from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { pluginRegistrationTool } from "../../tool";
import { catalogFixture, stepOptionsFixture } from "../catalogFixture";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

function StatusItemsProbe() {
  const items = useStatusItems();
  return (
    <output aria-label="tool statuses">
      {items.map((item) => (
        <span key={item.id}>{item.content}</span>
      ))}
    </output>
  );
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

function capabilitiesResponse() {
  return HttpResponse.json({
    isOnline: true,
    isolationModes: [2],
    sourceTypes: [0],
  });
}

function registrationReadHandlers(options?: {
  onCatalog?: () => void;
  onStepOptions?: () => void;
}) {
  return [
    http.get("http://localhost/api/plugin-registration/catalog", () => {
      options?.onCatalog?.();
      return HttpResponse.json(catalogFixture);
    }),
    http.get("http://localhost/api/plugin-registration/capabilities", () =>
      capabilitiesResponse(),
    ),
    http.get("http://localhost/api/plugin-registration/step-options", () => {
      options?.onStepOptions?.();
      return HttpResponse.json(stepOptionsFixture);
    }),
  ];
}

const toolBridge = {
  getActiveConnectionName: async () => connection.name,
  getActiveConnection: async () => ({
    ...connection,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
  listConnections: async () => [connection],
  getConnection: async () => ({
    ...connection,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
};

function renderTool(tabId: string) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: tabId,
            toolId: "plugin-registration",
            title: "Plugin Registration",
          }}
          definition={pluginRegistrationTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides: toolBridge },
  );
}

describe("Plugin Registration", () => {
  it("loads the catalog, expands a step, and shows stage details", async () => {
    httpServer.use(...registrationReadHandlers());

    renderTool("plugin-registration-browse");

    expect(await screen.findByText("Contoso.Plugins (1.0.0.0)")).toBeInTheDocument();
    expect(screen.queryByText("Microsoft.Crm.ObjectModel (9.0.0.0)")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
        "2 assemblies · 1 steps",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins.AccountPlugin" }));
    fireEvent.click(screen.getByText("AccountPlugin: Update of account"));

    expect(await screen.findByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Post-operation")).toBeInTheDocument();
  });

  it("disables a step from the context menu and refreshes the catalog", async () => {
    const enableUrls: string[] = [];
    let catalogLoads = 0;
    httpServer.use(
      ...registrationReadHandlers({ onCatalog: () => { catalogLoads += 1; } }),
      http.post(
        "http://localhost/api/plugin-registration/steps/:id/disable",
        ({ request }) => {
          enableUrls.push(request.url);
          return HttpResponse.json({ id: catalogFixture.steps[0]?.id });
        },
      ),
    );

    renderTool("plugin-registration-disable");

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins.AccountPlugin" }));
    fireEvent.contextMenu(screen.getByText("AccountPlugin: Update of account"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disable step" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => expect(enableUrls).toHaveLength(1));
    expect(enableUrls[0]).toContain(
      `/api/plugin-registration/steps/${catalogFixture.steps[0]?.id}/disable`,
    );
    await waitFor(() => expect(catalogLoads).toBeGreaterThan(1));
  });

  it("unregisters a step after confirming environment, name, and child counts", async () => {
    const urls: string[] = [];
    httpServer.use(
      ...registrationReadHandlers(),
      http.post(
        "http://localhost/api/plugin-registration/steps/:id/unregister",
        ({ request }) => {
          urls.push(request.url);
          return HttpResponse.json({ id: catalogFixture.steps[0]?.id });
        },
      ),
    );

    renderTool("plugin-registration-unregister");

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins.AccountPlugin" }));
    fireEvent.contextMenu(screen.getByText("AccountPlugin: Update of account"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unregister step" }));

    expect(
      await screen.findByText(
        "Unregister the step “AccountPlugin: Update of account” from Dev Org? This also deletes 1 related image.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unregister" }));

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0]).toContain(
      `/api/plugin-registration/steps/${catalogFixture.steps[0]?.id}/unregister`,
    );
  });

  it("shows a loader while unregistering a step", async () => {
    const gate = deferred();
    httpServer.use(
      ...registrationReadHandlers(),
      http.post(
        "http://localhost/api/plugin-registration/steps/:id/unregister",
        async () => {
          await gate.promise;
          return HttpResponse.json({ id: catalogFixture.steps[0]?.id });
        },
      ),
    );

    renderTool("plugin-registration-unregister-loader");

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins.AccountPlugin" }));
    fireEvent.contextMenu(screen.getByText("AccountPlugin: Update of account"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unregister step" }));
    fireEvent.click(screen.getByRole("button", { name: "Unregister" }));

    expect(await screen.findByRole("status", { name: "Unregistering…" })).toBeInTheDocument();
    gate.resolve();

    const toast = await screen.findByText("Step unregistered.");
    expect(toast.closest("[data-toast-type]")).toHaveAttribute("data-toast-type", "success");
    expect(toast.closest("[data-toast-type]")).toHaveClass("bg-[var(--color-primary)]");
    expect(screen.queryByRole("status", { name: "Unregistering…" })).not.toBeInTheDocument();
  });

  it("prefetches step options and reuses them when opening a step dialog", async () => {
    let stepOptionLoads = 0;
    httpServer.use(
      ...registrationReadHandlers({
        onStepOptions: () => {
          stepOptionLoads += 1;
        },
      }),
    );

    renderTool("plugin-registration-prefetch-steps");

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    await waitFor(() => expect(stepOptionLoads).toBe(1));

    fireEvent.contextMenu(screen.getByText("Contoso.Plugins.AccountPlugin"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Register step" }));
    expect(await screen.findByLabelText("Message")).toBeInTheDocument();
    expect(stepOptionLoads).toBe(1);
  });

  it("refetches catalog and step options together on refresh", async () => {
    let catalogLoads = 0;
    let stepOptionLoads = 0;
    httpServer.use(
      ...registrationReadHandlers({
        onCatalog: () => {
          catalogLoads += 1;
        },
        onStepOptions: () => {
          stepOptionLoads += 1;
        },
      }),
    );

    renderTool("plugin-registration-refresh");

    const refresh = await screen.findByRole("button", { name: "Refresh" });
    await waitFor(() => expect(refresh).toBeEnabled());
    await waitFor(() => {
      expect(catalogLoads).toBe(1);
      expect(stepOptionLoads).toBe(1);
    });

    fireEvent.click(refresh);
    await waitFor(() => {
      expect(catalogLoads).toBe(2);
      expect(stepOptionLoads).toBe(2);
    });
  });
});
