import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { earlyBoundGeneratorTool } from "../../tool";
import { tablesFixture } from "../fixtures";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

const toolBridge = {
  getActiveConnectionName: async () => connection.name,
  getActiveConnection: async () => ({
    ...connection,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
  listConnections: async () => [connection],
  getConnection: async (name: string) => ({
    name,
    envUrl: connection.envUrl,
    crmType: "online" as const,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
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

function renderTool(
  bridgeOverrides: DesktopBridgeOverrides = toolBridge,
  connectionName: string | null = connection.name,
) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: "early-bound-generator-test",
            toolId: "early-bound-generator",
            title: "Early Bound Generator",
            connectionName,
          }}
          definition={earlyBoundGeneratorTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides },
  );
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const tablesUrl = "http://localhost/api/early-bound/tables";
const generateUrl = "http://localhost/api/early-bound/generate";
const statusText = () => screen.getByLabelText("tool statuses");

describe("Early Bound Generator", () => {
  beforeEach(() => {
    httpServer.use(http.get(tablesUrl, () => HttpResponse.json(tablesFixture)));
  });

  it("asks for an environment and loads nothing", async () => {
    let calls = 0;
    httpServer.use(
      http.get(tablesUrl, () => {
        calls += 1;
        return HttpResponse.json(tablesFixture);
      }),
    );
    renderTool({ ...toolBridge, getActiveConnectionName: async () => null }, null);

    expect(await screen.findByText("Right-click this tab and choose Change connection.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(statusText()).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("generates code for the ticked tables with the chosen namespace", async () => {
    let body: unknown = null;
    httpServer.use(
      http.post(generateUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          fileName: "Entities.cs",
          code: "namespace Contoso.Model\n{\n    public partial class Account : Entity { }\n}\n",
          tableCount: 1,
        });
      }),
    );
    renderTool();

    const list = await screen.findByRole("list", { name: "Tables" });
    expect(statusText()).toHaveTextContent("0 of 3 tables selected");
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();

    fireEvent.click(within(list).getByRole("checkbox", { name: "Account" }));
    fireEvent.change(screen.getByLabelText("Namespace"), { target: { value: "Contoso.Model" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByLabelText("Generated code")).toHaveTextContent("public partial class Account");
    expect(body).toEqual({ namespace: "Contoso.Model", tables: ["account"] });
    expect(statusText()).toHaveTextContent("Generated 1 table");
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save as .cs" })).toBeEnabled();
  });

  it("selects only the tables the filter shows, and clears", async () => {
    renderTool();
    const list = await screen.findByRole("list", { name: "Tables" });

    fireEvent.change(screen.getByPlaceholderText("Filter tables"), { target: { value: "proj" } });
    await waitFor(() => expect(within(list).getAllByRole("checkbox")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Select shown" }));
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
  });

  it("blocks an invalid namespace", async () => {
    renderTool();
    const list = await screen.findByRole("list", { name: "Tables" });
    fireEvent.click(within(list).getByRole("checkbox", { name: "Account" }));

    fireEvent.change(screen.getByLabelText("Namespace"), { target: { value: "1 bad" } });

    expect(screen.getByText("Use a C# namespace, for example Contoso.Model.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("shows the sidecar message when generation fails", async () => {
    httpServer.use(
      http.post(generateUrl, () =>
        HttpResponse.json({ message: "None of the selected tables were found in this environment." }, { status: 400 }),
      ),
    );
    renderTool();
    const list = await screen.findByRole("list", { name: "Tables" });
    fireEvent.click(within(list).getByRole("checkbox", { name: "Contact" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(
      await screen.findByText("None of the selected tables were found in this environment."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Generated code")).not.toBeInTheDocument();
  });

  it("shows a retry when the table list fails", async () => {
    httpServer.use(
      http.get(tablesUrl, () => HttpResponse.json({ message: "Access denied." }, { status: 400 })),
    );
    renderTool();

    expect(await screen.findByText("Access denied.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(statusText()).toHaveTextContent("Could not load tables");
  });
});
