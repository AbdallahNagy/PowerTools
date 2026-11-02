import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { legacyConnection } from "../../../../../../test/support/desktopBridge";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { environmentVariablesManagerTool } from "../../tool";
import type { SaveValueItem } from "../../model/types";
import { apiUrlId, retriesId, solutionsFixture, variablesFixture } from "../fixtures";

const connection = legacyConnection("Dev Org", "https://dev.example.test", "online");

const toolBridge: DesktopBridgeOverrides = {
  getActiveConnectionId: async () => connection.id,
  getActiveConnection: async () => ({ ...connection, token: "dev-token", expiresOn: "2099-01-01T00:00:00.000Z" }),
  listConnections: async () => [connection, legacyConnection("Other Org", "https://other.example.test")],
  getConnection: async (name: string) => ({
    id: name,
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

function Tool({ connectionId }: { connectionId: string | null }) {
  return (
    <ToolHost
      tab={{
        id: "environment-variables-manager-test",
        toolId: "environment-variables-manager",
        title: "Environment Variables Manager",
        connectionId,
      }}
      definition={environmentVariablesManagerTool}
    />
  );
}

function renderTool(connectionId: string | null = connection.id) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <Tool connectionId={connectionId} />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides: toolBridge },
  );
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const base = "http://localhost/api/environment-variables";

function statuses() {
  return screen.getByLabelText("tool statuses");
}

function rowOf(text: string) {
  return screen.getByText(text).closest("tr")!;
}

async function loaded() {
  await screen.findByText("API URL");
}

describe("Environment Variables Manager", () => {
  beforeEach(() => {
    httpServer.use(
      http.get(base, () => HttpResponse.json(variablesFixture())),
      http.get(`${base}/solutions`, () => HttpResponse.json(solutionsFixture)),
    );
  });

  it("asks for an environment and loads nothing", async () => {
    let calls = 0;
    httpServer.use(http.get(base, () => {
      calls += 1;
      return HttpResponse.json([]);
    }));
    renderTool(null);

    expect(await screen.findByText("Connect to an environment to see its environment variables.")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it("lists variables with their values, defaults and managed state", async () => {
    renderTool();
    await loaded();

    expect(screen.getByRole("separator", { name: "Resize panes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current value of API URL")).toHaveValue("https://api.example.test");
    const retries = screen.getByLabelText("Current value of Retries");
    expect(retries).toHaveValue("");
    expect(retries).toHaveAttribute("placeholder", "3");
    expect(within(rowOf("Retries")).getByText("Default")).toBeInTheDocument();
    expect(screen.getByLabelText("Current value of Feature On")).toHaveValue("no");
    expect(within(rowOf("Region")).getByText("Managed value")).toBeInTheDocument();
    expect(within(rowOf("Settings")).getByRole("button", { name: "Edit value of Settings" })).toBeInTheDocument();
    expect(screen.getByText("Select a variable to edit its value and definition.")).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("6 variables");

    fireEvent.change(screen.getByPlaceholderText("Filter by name, schema name, or value"), { target: { value: "retr" } });
    expect(screen.queryByText("API URL")).not.toBeInTheDocument();
    expect(statuses()).toHaveTextContent("1 of 6 variables");
    fireEvent.change(screen.getByPlaceholderText("Filter by name, schema name, or value"), { target: { value: "zzz" } });
    expect(screen.getByText('No variables match "zzz".')).toBeInTheDocument();
  });

  it("shows an empty environment and a load error with retry", async () => {
    let fail = true;
    httpServer.use(http.get(base, () =>
      fail ? HttpResponse.json({ code: "PrivilegeDenied", message: "No read access." }, { status: 403 }) : HttpResponse.json([])));
    renderTool();

    expect(await screen.findByText("No read access.")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("This environment has no environment variables. Choose New Variable to create one."),
    ).toBeInTheDocument();
  });

  it("blocks saving invalid values, then saves edits together with per-row results", async () => {
    const sent: SaveValueItem[] = [];
    httpServer.use(http.post(`${base}/values`, async ({ request }) => {
      const body = (await request.json()) as { items: SaveValueItem[] };
      sent.push(...body.items);
      return HttpResponse.json({
        results: body.items.map((item) =>
          item.definitionId === retriesId
            ? { definitionId: item.definitionId, valueId: "new-value", ok: true, error: null }
            : { definitionId: item.definitionId, valueId: item.valueId, ok: false, error: "Principal user is missing prvWrite." },
        ),
      });
    }));
    renderTool();
    await loaded();

    fireEvent.change(screen.getByLabelText("Current value of Retries"), { target: { value: "lots" } });
    expect(within(rowOf("Retries")).getByText("Invalid")).toBeInTheDocument();
    expect(screen.getByLabelText("Current value of Retries")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save Changes (1)" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Current value of Retries"), { target: { value: "-5" } });
    fireEvent.change(screen.getByLabelText("Current value of API URL"), { target: { value: "https://new.example.test" } });
    expect(within(rowOf("Retries")).getByText("Edited")).toBeInTheDocument();
    expect(statuses()).toHaveTextContent("6 variables · 2 unsaved");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes (2)" }));

    expect(await screen.findByText("1 of 2 values failed. Select a failed row to see why.")).toBeInTheDocument();
    expect(sent).toEqual([
      { definitionId: apiUrlId, valueId: "aaaaaaaa-0000-0000-0000-000000000001", value: "https://new.example.test" },
      { definitionId: retriesId, valueId: null, value: "-5" },
    ]);
    expect(within(rowOf("Retries")).getByText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Current value of Retries")).toHaveValue("-5");
    expect(within(rowOf("API URL")).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes (1)" })).toBeEnabled();

    fireEvent.click(screen.getByText("API URL"));
    expect(await screen.findByText("Principal user is missing prvWrite.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(screen.getByLabelText("Current value of API URL")).toHaveValue("https://api.example.test");
    expect(screen.getByRole("button", { name: "Save Changes (0)" })).toBeDisabled();
  });

  it("edits a JSON value in the details panel", async () => {
    renderTool();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Edit value of Settings" }));
    expect(await screen.findByRole("textbox", { name: "Current Value" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("contoso_Settings")).toHaveAttribute("readonly");
  });

  it("builds a secret path from its parts", async () => {
    renderTool();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Edit value of Password" }));
    const details = screen.getByRole("region", { name: "Variable details" });
    fireEvent.change(within(details).getByLabelText("Current Value: Subscription ID"), { target: { value: "sub-1" } });
    expect(within(details).getByText("Fill in every part of the secret path.")).toBeInTheDocument();
    fireEvent.change(within(details).getByLabelText("Current Value: Resource Group"), { target: { value: "rg" } });
    fireEvent.change(within(details).getByLabelText("Current Value: Key Vault Name"), { target: { value: "kv" } });
    fireEvent.change(within(details).getByLabelText("Current Value: Secret Name"), { target: { value: "pw" } });

    expect(within(details).getByLabelText("Current Value: Secret path")).toHaveTextContent(
      "/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv/secrets/pw",
    );
    expect(screen.getByRole("button", { name: "Save Changes (1)" })).toBeEnabled();
  });

  it("asks before dropping unsaved definition changes", async () => {
    renderTool();
    await loaded();

    fireEvent.click(screen.getByText("API URL"));
    const definition = screen.getByRole("region", { name: "Variable details" });
    fireEvent.change(within(definition).getByLabelText("Display Name"), { target: { value: "Service URL" } });
    fireEvent.click(screen.getByText("Retries"));

    const dialog = await screen.findByRole("dialog", { name: "Discard changes to this definition?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep Editing" }));
    expect(within(definition).getByLabelText("Display Name")).toHaveValue("Service URL");

    fireEvent.click(screen.getByText("Retries"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(within(screen.getByRole("region", { name: "Variable details" })).getByLabelText("Display Name")).toHaveValue("Retries");
  });

  it("saves only changed definition fields", async () => {
    let body: unknown = null;
    httpServer.use(http.put(`${base}/definitions/${apiUrlId}`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ definitionId: apiUrlId });
    }));
    renderTool();
    await loaded();

    fireEvent.click(screen.getByText("API URL"));
    const definition = screen.getByRole("region", { name: "Variable details" });
    expect(within(definition).getByRole("button", { name: "Save Definition" })).toBeDisabled();
    fireEvent.change(within(definition).getByLabelText("Display Name"), { target: { value: "Service URL" } });
    fireEvent.click(within(definition).getByRole("button", { name: "Save Definition" }));

    expect(await screen.findByText("Definition saved.")).toBeInTheDocument();
    expect(body).toEqual({ displayName: "Service URL" });
    expect(within(rowOf("contoso_ApiUrl")).getByText("Service URL")).toBeInTheDocument();
  });

  it("deletes a value after confirmation and falls back to the default", async () => {
    let deleted: string | null = null;
    httpServer.use(http.delete(`${base}/values/:id`, ({ params }) => {
      deleted = String(params.id);
      return HttpResponse.json({ valueId: params.id });
    }));
    renderTool();
    await loaded();

    fireEvent.click(screen.getByText("API URL"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Value" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Value" });
    expect(dialog).toHaveTextContent("Delete the current value of API URL? The variable will use its default value.");
    expect(deleted).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Value deleted.")).toBeInTheDocument();
    expect(deleted).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(screen.getByLabelText("Current value of API URL")).toHaveAttribute("placeholder", "https://default.example.test");
    expect(screen.queryByRole("button", { name: "Delete Value" })).not.toBeInTheDocument();
  });

  it("keeps managed definitions and values from being deleted", async () => {
    renderTool();
    await loaded();

    fireEvent.click(screen.getByText("Region"));
    expect(screen.getByRole("button", { name: "Delete Variable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Value" })).toBeDisabled();
    expect(screen.getByText(/This value belongs to a managed solution\. Saving changes it in this environment\./)).toBeInTheDocument();
    expect(screen.getByText(/Fabrikam Core/)).toBeInTheDocument();
  });

  it("deletes a variable and shows a dependency error when blocked", async () => {
    let blocked = true;
    httpServer.use(http.delete(`${base}/definitions/:id`, () =>
      blocked
        ? HttpResponse.json(
            { code: "HasDependencies", message: "1 component(s) depend on this variable, such as flows or apps. Remove them first." },
            { status: 409 },
          )
        : HttpResponse.json({ remainingValueIds: [] })));
    renderTool();
    await loaded();

    fireEvent.click(screen.getByText("Retries"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Variable" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Variable" });
    expect(dialog).toHaveTextContent("Delete Retries? Its current value is deleted too. This cannot be undone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText(/depend on this variable/)).toBeInTheDocument();

    blocked = false;
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Variable deleted.")).toBeInTheDocument();
    expect(screen.queryByText("contoso_Retries")).not.toBeInTheDocument();
    expect(screen.getByText("Select a variable to edit its value and definition.")).toBeInTheDocument();
  });

  it("creates a variable in a solution and selects it", async () => {
    let body: Record<string, unknown> | null = null;
    const created = {
      ...variablesFixture()[1]!,
      definitionId: "77777777-7777-7777-7777-777777777777",
      schemaName: "contoso_Timeout",
      displayName: "Timeout",
      defaultValue: "30",
    };
    let listed = variablesFixture();
    httpServer.use(
      http.get(base, () => HttpResponse.json(listed)),
      http.post(`${base}/definitions`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        listed = [...listed, created];
        return HttpResponse.json({ variable: created, valueError: null });
      }),
    );
    renderTool();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "New Variable" }));
    const dialog = await screen.findByRole("dialog", { name: "New Variable" });
    const createButton = within(dialog).getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(within(dialog).getByLabelText("Type")).not.toHaveTextContent("Data Source");

    const solution = within(dialog).getByRole("combobox", { name: "Solution" });
    await waitFor(() => expect(solution).toBeEnabled());
    fireEvent.change(solution, { target: { value: "Contoso" } });
    fireEvent.click(await screen.findByRole("option", { name: /Contoso Core/ }));
    expect(within(dialog).getByLabelText("Schema Name")).toHaveValue("contoso_");
    expect(within(dialog).getByText("Schema names in this solution start with contoso_.")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Display Name"), { target: { value: "request timeout" } });
    expect(within(dialog).getByLabelText("Schema Name")).toHaveValue("contoso_RequestTimeout");
    fireEvent.change(within(dialog).getByLabelText("Display Name"), { target: { value: "Timeout" } });
    expect(within(dialog).getByLabelText("Schema Name")).toHaveValue("contoso_Timeout");
    fireEvent.change(within(dialog).getByLabelText("Type"), { target: { value: "100000001" } });
    fireEvent.change(within(dialog).getByLabelText("Default Value"), { target: { value: "thirty" } });
    expect(within(dialog).getByText("Enter a decimal number.")).toBeInTheDocument();
    expect(createButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Default Value"), { target: { value: "30" } });
    fireEvent.change(within(dialog).getByLabelText("Current Value"), { target: { value: "45" } });
    fireEvent.click(createButton);

    expect(await screen.findByText("Variable created.")).toBeInTheDocument();
    expect(body).toEqual({
      schemaName: "contoso_Timeout",
      displayName: "Timeout",
      type: 100000001,
      defaultValue: "30",
      initialValue: "45",
      solutionUniqueName: "ContosoCore",
    });
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Variable details" })).getByLabelText("Display Name")).toHaveValue("Timeout"),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the New Variable dialog open with the error when create fails", async () => {
    httpServer.use(http.post(`${base}/definitions`, () =>
      HttpResponse.json({ code: "Duplicate", message: "A record with these values already exists." }, { status: 409 })));
    renderTool();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "New Variable" }));
    const dialog = await screen.findByRole("dialog", { name: "New Variable" });
    fireEvent.change(within(dialog).getByLabelText("Schema Name"), { target: { value: "contoso_ApiUrl" } });
    fireEvent.change(within(dialog).getByLabelText("Display Name"), { target: { value: "API URL" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(dialog).findByText("A record with these values already exists.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Schema Name")).toHaveValue("contoso_ApiUrl");
  });

  it("drops unsaved edits when the environment changes", async () => {
    function SwitchableTool() {
      const [name, setName] = useState("Dev Org");
      return (
        <ConnectionsProvider>
          <StatusBarProvider>
            <button type="button" onClick={() => setName("Other Org")}>
              Switch tab connection
            </button>
            <Tool connectionId={name} />
            <StatusItemsProbe />
          </StatusBarProvider>
        </ConnectionsProvider>
      );
    }
    httpServer.use(http.get(base, ({ request }) =>
      HttpResponse.json(request.headers.get("x-environment-url") === "https://other.example.test" ? [] : variablesFixture())));

    renderWithProviders(<SwitchableTool />, { bridgeOverrides: toolBridge });
    await loaded();
    fireEvent.change(screen.getByLabelText("Current value of API URL"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch tab connection" }));

    expect(await screen.findByText("Discarded 1 unsaved change from the previous environment.")).toBeInTheDocument();
    expect(
      await screen.findByText("This environment has no environment variables. Choose New Variable to create one."),
    ).toBeInTheDocument();
  });
});
