import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { solutionLayersExplorerTool } from "../../tool";
import {
  componentTypesFixture,
  scriptId,
  scriptLayersAfterRemoval,
  scriptLayersFixture,
  styleId,
  styleLayersFixture,
  webResourcesFixture,
} from "../fixtures";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { codeEditorValue } from "../../../../../../test/support/codeEditor";
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
    envUrl: name === "Other Org" ? "https://other.example.test" : connection.envUrl,
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

function Tool({ connectionName }: { connectionName: string | null }) {
  return (
    <ToolHost
      tab={{
        id: "solution-layers-explorer-test",
        toolId: "solution-layers-explorer",
        title: "Solution Layers Explorer",
        connectionName,
      }}
      definition={solutionLayersExplorerTool}
    />
  );
}

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge, connectionName: string | null = connection.name) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <Tool connectionName={connectionName} />
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

const base = "http://localhost/api/solution-layers";

function layersFor(componentId: string | null) {
  if (componentId === scriptId) return scriptLayersFixture;
  if (componentId === styleId) return styleLayersFixture;
  return { ...scriptLayersFixture, componentId: componentId ?? "", layers: [], hasActiveLayer: false, canRemoveActive: false };
}

function defaultHandlers() {
  return [
    http.get(`${base}/component-types`, () => HttpResponse.json(componentTypesFixture)),
    http.get(`${base}/components`, () => HttpResponse.json(webResourcesFixture)),
    http.get(`${base}/layers`, ({ request }) =>
      HttpResponse.json(layersFor(new URL(request.url).searchParams.get("componentId")))),
    http.get("http://localhost/api/metadata/entities", () =>
      HttpResponse.json([
        {
          logicalName: "account",
          displayName: "Account",
          primaryIdAttribute: "accountid",
          primaryNameAttribute: "name",
          isCustom: false,
        },
      ])),
  ];
}

async function selectComponent(name: string) {
  fireEvent.click(await screen.findByText(name));
}

function statuses() {
  return screen.getByLabelText("tool statuses");
}

describe("Solution Layers Explorer", () => {
  beforeEach(() => {
    httpServer.use(...defaultHandlers());
  });

  it("asks for an environment and loads nothing", async () => {
    let calls = 0;
    httpServer.use(http.get(`${base}/component-types`, () => {
      calls += 1;
      return HttpResponse.json(componentTypesFixture);
    }));
    renderTool({ ...toolBridge, getActiveConnectionName: async () => null }, null);

    expect(await screen.findAllByText("Select an environment")).toHaveLength(2);
    expect(
      screen.getAllByText("Choose an environment in the connection control at the bottom of the sidebar."),
    ).toHaveLength(2);
    expect(screen.getByLabelText("Component type")).toBeDisabled();
    expect(screen.getByPlaceholderText("Search by name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Active layers (0)" })).toBeDisabled();
    expect(screen.getByRole("separator", { name: "Resize panes" })).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("defaults to web resources, sorts by name, and searches after a pause", async () => {
    const searches: Array<string | null> = [];
    httpServer.use(http.get(`${base}/components`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      expect(params.get("componentType")).toBe("61");
      searches.push(params.get("search"));
      return HttpResponse.json(webResourcesFixture);
    }));
    renderTool();

    expect(await screen.findByText("Main script")).toBeInTheDocument();
    expect(screen.getByLabelText("Component type")).toHaveValue("61");
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1]!.textContent);
    expect(names).toEqual(["Main script", "Site styles"]);

    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    const reversed = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1]!.textContent);
    expect(reversed).toEqual(["Site styles", "Main script"]);

    fireEvent.change(screen.getByPlaceholderText("Search by name"), { target: { value: "main" } });
    await waitFor(() => expect(searches).toContain("main"));
    expect(screen.queryByText("Showing the first 50 matches. Refine the search to narrow the list.")).not.toBeInTheDocument();
  });

  it("requires a table before searching columns", async () => {
    renderTool();
    await screen.findByText("Main script");

    fireEvent.change(screen.getByLabelText("Component type"), { target: { value: "2" } });

    expect(await screen.findByText("Choose a table to search its columns.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name")).toBeDisabled();
    expect(await screen.findByRole("option", { name: "Account (account)" })).toBeInTheDocument();
  });

  it("shows the server cap message when results are truncated", async () => {
    httpServer.use(http.get(`${base}/components`, () =>
      HttpResponse.json({ ...webResourcesFixture, truncated: true })));
    renderTool();

    expect(await screen.findByText("Showing the first 50 matches. Refine the search to narrow the list.")).toBeInTheDocument();
  });

  it("lists layers with Active on top and shows the selected layer's content", async () => {
    renderTool();
    await selectComponent("Main script");

    expect(await screen.findByRole("heading", { name: "Main script" })).toBeInTheDocument();
    expect(await screen.findByText("Layer 3 · Active")).toBeInTheDocument();
    const layerTable = screen.getByRole("columnheader", { name: "Overwrite Time" }).closest("table")!;
    const solutions = within(layerTable).getAllByRole("row").slice(1)
      .map((row) => within(row).getAllByRole("cell")[1]!.textContent);
    expect(solutions).toEqual(["ActiveActive", "ContosoPatch", "ContosoCore"]);
    expect(within(layerTable).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Order", "Solution", "Publisher", "Version", "Overwrite Time",
    ]);
    expect(statuses()).toHaveTextContent("3 layers · Active layer present");
    expect(screen.getByRole("button", { name: "Remove Active layer" })).toBeEnabled();
    expect(screen.getByRole("separator", { name: "Resize layer details" })).toBeInTheDocument();

    const changes = await screen.findByRole("textbox", { name: "Changes" });
    expect(codeEditorValue(changes)).toContain('"Key": "content"');

    fireEvent.mouseDown(screen.getByRole("tab", { name: "All properties" }));
    fireEvent.click(screen.getByText("ContosoCore"));
    expect(screen.getByText("Layer 1 · ContosoCore")).toBeInTheDocument();
    const all = await screen.findByRole("textbox", { name: "All properties" });
    expect(codeEditorValue(all)).toBe("{not json");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Changes" }));
    expect(await screen.findByText("This layer records no changes.")).toBeInTheDocument();
  });

  it("compares two layers, filters to differences, and decodes web resource content", async () => {
    renderTool();
    await selectComponent("Main script");
    await screen.findByText("Layer 3 · Active");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compare" }));
    expect(await screen.findByLabelText("Left layer")).toHaveValue("layer-patch");
    expect(screen.getByLabelText("Right layer")).toHaveValue("layer-active");
    expect(screen.getByText("Select a property to see its values side by side.")).toBeInTheDocument();

    const table = screen.getByRole("columnheader", { name: "Property" }).closest("table")!;
    expect(within(table).getByText("displayname")).toBeInTheDocument();
    expect(within(table).getByText("Different")).toBeInTheDocument();
    expect(within(table).getByText("Only left")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Only differences"));
    expect(within(table).queryByText("displayname")).not.toBeInTheDocument();

    fireEvent.click(within(table).getByText("content"));
    expect(await screen.findByText("Decoded from base64.")).toBeInTheDocument();
    const left = await screen.findByRole("textbox", { name: "content: 2 · ContosoPatch" });
    expect(left).toHaveTextContent("console.log('managed');");

    fireEvent.change(screen.getByLabelText("Left layer"), { target: { value: "layer-base" } });
    expect(await screen.findByText("One layer's properties could not be read as JSON.")).toBeInTheDocument();
    expect(screen.getByText("Select a property to see its values side by side.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Left layer"), { target: { value: "layer-active" } });
    expect(screen.getByText("Both sides show the same layer.")).toBeInTheDocument();
  });

  it("disables removal for a component that exists only in the Active layer", async () => {
    renderTool();
    await selectComponent("Site styles");

    expect(await screen.findByText("Layer 1 · Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Active layer" })).toBeDisabled();
    expect(
      screen.getByLabelText("This component exists only in the Active layer, so there is nothing to fall back to."),
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Compare" }));
    expect(await screen.findByText("This component has only one layer. There is nothing to compare.")).toBeInTheDocument();
  });

  it("shows an empty state for a component without layer rows", async () => {
    httpServer.use(http.get(`${base}/components`, () =>
      HttpResponse.json({
        components: [{ componentId: "cccccccc-0000-0000-0000-000000000001", componentType: 61, name: "Orphan", logicalName: "new_/orphan.js", parentEntity: null }],
        truncated: false,
      })));
    renderTool();
    await selectComponent("Orphan");

    expect(await screen.findByText("No solution layers were found for this component.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Active layer" })).toBeDisabled();
    expect(statuses()).toHaveTextContent("0 layers · No Active layer");
  });

  it("removes the Active layer after confirmation and shows the refreshed layers", async () => {
    let body: unknown = null;
    httpServer.use(http.post(`${base}/remove-active`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(scriptLayersAfterRemoval);
    }));
    renderTool();
    await selectComponent("Main script");
    await screen.findByText("Layer 3 · Active");

    fireEvent.click(screen.getByRole("button", { name: "Remove Active layer" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Active layer" });
    expect(dialog).toHaveTextContent("Remove the unmanaged Active layer of Main script (Web resource)?");
    expect(dialog).toHaveTextContent("ContosoPatch 1.2.1.0");
    expect(within(dialog).getByText(/It cannot be undone/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Active layer" }));

    expect(await screen.findByText("Active layer removed.")).toBeInTheDocument();
    expect(body).toEqual({ componentType: 61, componentId: scriptId });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Layer 2 · ContosoPatch")).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("2 layers · No Active layer");
    expect(screen.getByRole("button", { name: "Remove Active layer" })).toBeDisabled();
  });

  it("keeps the dialog open with a clear message when removal is refused or not permitted", async () => {
    let status = 409;
    httpServer.use(http.post(`${base}/remove-active`, () =>
      HttpResponse.json(
        status === 409
          ? { code: "OnlyActiveLayer", message: "server text" }
          : { code: "PrivilegeDenied", message: "missing privilege" },
        { status },
      )));
    renderTool();
    await selectComponent("Main script");
    await screen.findByText("Layer 3 · Active");

    fireEvent.click(screen.getByRole("button", { name: "Remove Active layer" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Active layer" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Active layer" }));
    expect(
      await within(dialog).findByText("This component no longer has an Active layer above another layer."),
    ).toBeInTheDocument();

    status = 403;
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Active layer" }));
    expect(
      await within(dialog).findByText("You need System Customizer or System Administrator rights to remove the Active layer."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Remove Active layer" })).toBeInTheDocument();
  });

  it("shows a permission message and Retry when layers cannot be read", async () => {
    let fail = true;
    httpServer.use(http.get(`${base}/layers`, () =>
      fail
        ? HttpResponse.json({ code: "PrivilegeDenied", message: "missing privilege" }, { status: 403 })
        : HttpResponse.json(scriptLayersFixture)));
    renderTool();
    await selectComponent("Main script");

    expect(
      await screen.findByText("You need System Customizer or System Administrator rights to read solution layers."),
    ).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("Could not load layers");

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Layer 3 · Active")).toBeInTheDocument();
  });

  it("shows a search error with Retry", async () => {
    httpServer.use(http.get(`${base}/components`, () =>
      HttpResponse.json({ code: "DataverseFault", message: "Search failed." }, { status: 422 })));
    renderTool();

    expect(await screen.findByText("Search failed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("Could not search components");
  });

  it("removes Active layers in bulk one at a time and reports each result", async () => {
    const order: string[] = [];
    httpServer.use(http.post(`${base}/remove-active`, async ({ request }) => {
      const { componentId } = (await request.json()) as { componentId: string };
      order.push(componentId);
      if (componentId === styleId) {
        return HttpResponse.json(
          { code: "OnlyActiveLayer", message: "This component exists only in the Active layer, so there is nothing to fall back to." },
          { status: 409 },
        );
      }
      return HttpResponse.json(scriptLayersAfterRemoval);
    }));
    renderTool();
    await screen.findByText("Main script");

    fireEvent.click(screen.getByLabelText("Select all components"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Active layers (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Active layers" });
    expect(dialog).toHaveTextContent("Remove the unmanaged Active layer of these 2 components?");
    expect(dialog).toHaveTextContent("Environment: Dev Org");

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove 2 Active layers" }));

    expect(await within(dialog).findByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(order).toEqual([scriptId, styleId]);
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).getByText("Skipped")).toBeInTheDocument();
    expect(await screen.findByText("Removed 1 of 2 Active layers. 1 skipped, 0 failed.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove Active layers (0)" })).toBeDisabled();
  });

  it("clears the selection and results when the environment changes", async () => {
    function SwitchableTool() {
      const [name, setName] = useState("Dev Org");
      return (
        <ConnectionsProvider>
          <StatusBarProvider>
            <button type="button" onClick={() => setName("Other Org")}>
              Switch tab connection
            </button>
            <Tool connectionName={name} />
            <StatusItemsProbe />
          </StatusBarProvider>
        </ConnectionsProvider>
      );
    }
    httpServer.use(http.get(`${base}/components`, ({ request }) =>
      request.headers.get("x-environment-url") === "https://other.example.test"
        ? HttpResponse.json({ components: [], truncated: false })
        : HttpResponse.json(webResourcesFixture)));

    renderWithProviders(<SwitchableTool />, { bridgeOverrides: toolBridge });
    await selectComponent("Main script");
    await screen.findByText("Layer 3 · Active");
    fireEvent.change(screen.getByPlaceholderText("Search by name"), { target: { value: "main" } });

    fireEvent.click(screen.getByRole("button", { name: "Switch tab connection" }));

    expect(await screen.findByText("No matching components")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name")).toHaveValue("");
    expect(screen.getByText("Select a component to see its solution layers.")).toBeInTheDocument();
    expect(screen.queryByText("Layer 3 · Active")).not.toBeInTheDocument();
  });
});
