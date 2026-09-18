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
import { catalogFixture } from "../catalogFixture";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

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

describe("Plugin Registration", () => {
  it("loads the catalog, expands a step, and shows stage details", async () => {
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json(catalogFixture),
      ),
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
    );

    renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <ToolHost
            tab={{
              id: "plugin-registration-browse",
              toolId: "plugin-registration",
              title: "Plugin Registration",
            }}
            definition={pluginRegistrationTool}
          />
          <StatusItemsProbe />
        </StatusBarProvider>
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
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
        },
      },
    );

    expect(await screen.findByText("Contoso.Plugins (1.0.0.0)")).toBeInTheDocument();
    expect(screen.queryByText("Microsoft.Crm.ObjectModel (9.0.0.0)")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
        "2 assemblies · 1 steps",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Account Plugin" }));
    fireEvent.click(screen.getByText("AccountPlugin: Update of account"));

    expect(await screen.findByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Post-operation")).toBeInTheDocument();
  });

  it("disables a step from the context menu and refreshes the catalog", async () => {
    const enableUrls: string[] = [];
    let catalogLoads = 0;
    httpServer.use(
      http.get("http://localhost/api/plugin-registration/catalog", () => {
        catalogLoads += 1;
        return HttpResponse.json(catalogFixture);
      }),
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
      http.post(
        "http://localhost/api/plugin-registration/steps/:id/disable",
        ({ request }) => {
          enableUrls.push(request.url);
          return HttpResponse.json({ id: catalogFixture.steps[0]?.id });
        },
      ),
    );

    renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <ToolHost
            tab={{
              id: "plugin-registration-disable",
              toolId: "plugin-registration",
              title: "Plugin Registration",
            }}
            definition={pluginRegistrationTool}
          />
        </StatusBarProvider>
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
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
        },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Account Plugin" }));
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
      http.get("http://localhost/api/plugin-registration/catalog", () =>
        HttpResponse.json(catalogFixture),
      ),
      http.get("http://localhost/api/plugin-registration/capabilities", () =>
        HttpResponse.json({
          isOnline: true,
          isolationModes: [2],
          sourceTypes: [0],
        }),
      ),
      http.post(
        "http://localhost/api/plugin-registration/steps/:id/unregister",
        ({ request }) => {
          urls.push(request.url);
          return HttpResponse.json({ id: catalogFixture.steps[0]?.id });
        },
      ),
    );

    renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <ToolHost
            tab={{
              id: "plugin-registration-unregister",
              toolId: "plugin-registration",
              title: "Plugin Registration",
            }}
            definition={pluginRegistrationTool}
          />
        </StatusBarProvider>
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
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
        },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Expand Contoso.Plugins (1.0.0.0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Account Plugin" }));
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
});
