import { useState } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { attributeExplorerTool } from "../../tool";
import {
  accountResponse,
  contactResponse,
  otherEnvironmentTables,
  tablesFixture,
} from "../fixtures";
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

function tab(connectionName: string | null) {
  return {
    id: "attribute-explorer-test",
    toolId: "attribute-explorer",
    title: "Attribute Explorer",
    connectionName,
  };
}

function renderTool(
  bridgeOverrides: DesktopBridgeOverrides = toolBridge,
  connectionName: string | null = connection.name,
) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost tab={tab(connectionName)} definition={attributeExplorerTool} />
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

const tablesUrl = "http://localhost/api/attribute-explorer/tables";
const attributesUrl = "http://localhost/api/attribute-explorer/tables/:name/attributes";

function responseFor(name: unknown) {
  if (name === "account") return HttpResponse.json(accountResponse);
  if (name === "contact") return HttpResponse.json(contactResponse);
  return HttpResponse.json(
    { code: "table_not_found", message: "This table no longer exists. Refresh metadata." },
    { status: 404 },
  );
}

function defaultHandlers() {
  return [
    http.get(tablesUrl, ({ request }) =>
      request.headers.get("x-environment-url") === "https://other.example.test"
        ? HttpResponse.json(otherEnvironmentTables)
        : HttpResponse.json(tablesFixture),
    ),
    http.get(attributesUrl, ({ params }) => responseFor(params.name)),
  ];
}

const statusText = () => screen.getByLabelText("tool statuses");

async function selectTable(name: RegExp) {
  const list = await screen.findByRole("list", { name: "Tables" });
  fireEvent.click(within(list).getByRole("button", { name }));
}

function gridRowNames() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent);
}

describe("Attribute Explorer", () => {
  beforeEach(() => {
    httpServer.use(...defaultHandlers());
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

    expect(
      await screen.findAllByText("Right-click this tab and choose Change connection."),
    ).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Refresh metadata" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Search by display or logical name")).toBeDisabled();
    expect(screen.getByRole("separator", { name: "Resize panes" })).toBeInTheDocument();
    expect(statusText()).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("lists tables, shows the count, and focuses the search box", async () => {
    renderTool();

    expect(await screen.findByRole("status", { name: "Loading tables" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Tables" });
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(within(list).getByText("new_project")).toBeInTheDocument();
    expect(within(list).getAllByText("new_unlabeled")).toHaveLength(2);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(statusText()).toHaveTextContent("4 tables");
    expect(screen.getByText("Select a table to see its fields.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search by display or logical name")).toHaveFocus(),
    );
  });

  it("filters tables by display or logical name and shows the filtered count", async () => {
    renderTool();
    await screen.findByRole("list", { name: "Tables" });
    const search = screen.getByPlaceholderText("Search by display or logical name");

    fireEvent.change(search, { target: { value: "PROJ" } });
    expect(within(screen.getByRole("list", { name: "Tables" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("1 of 4")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "cont" } });
    expect(screen.getByRole("button", { name: /Contact/ })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText('No tables match "zzz".')).toBeInTheDocument();
  });

  it("moves the selection with the arrow keys", async () => {
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");

    const list = screen.getByRole("list", { name: "Tables" });
    fireEvent.keyDown(within(list).getByRole("button", { name: /Account/ }), { key: "ArrowDown" });
    expect(within(list).getByRole("button", { name: /Contact/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    fireEvent.keyDown(within(list).getByRole("button", { name: /Contact/ }), { key: "ArrowUp" });
    expect(within(list).getByRole("button", { name: /Account/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows the five-column grid for the selected table", async () => {
    renderTool();
    await selectTable(/Account/);

    expect(await screen.findByRole("columnheader", { name: /Display name/ })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent?.replace(/[↑↓]/, ""))).toEqual([
      "Display name",
      "Logical name",
      "Type",
      "Related table",
      "Required",
    ]);
    expect(screen.getByText("7 fields")).toBeInTheDocument();
    expect(statusText()).toHaveTextContent("account: 7 fields");
    expect(screen.getByRole("list", { name: "Tables" }).querySelector("[aria-current='true']")).not.toBeNull();

    const row = screen.getByRole("row", { name: /Primary Contact/ });
    expect(within(row).getByText("primarycontactid")).toBeInTheDocument();
    expect(within(row).getByText("Lookup")).toBeInTheDocument();
    expect(within(row).getByText("contact")).toBeInTheDocument();
    expect(within(row).getByText("Optional")).toBeInTheDocument();

    const customer = screen.getByRole("row", { name: /Customer/ });
    expect(within(customer).getByTitle("account, contact")).toBeInTheDocument();
    expect(within(customer).getByText("Recommended")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Account Name/ })).getByText("Required")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Annual Revenue/ })).getByText("System required")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /new_nolabel/ })).getAllByText("new_nolabel")).toHaveLength(2);
  });

  it("filters and sorts the grid, and resets the field search when the table changes", async () => {
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");

    expect(gridRowNames()[0]).toBe("name");

    fireEvent.click(screen.getByRole("button", { name: "Display name" }));
    expect(screen.getByRole("columnheader", { name: /Display name/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(gridRowNames()[0]).toBe("primarycontactid");

    fireEvent.click(screen.getByRole("button", { name: "Logical name" }));
    expect(gridRowNames()[0]).toBe("customerid");

    const search = screen.getByPlaceholderText("Search fields by display or logical name");
    fireEvent.change(search, { target: { value: "REVENUE" } });
    expect(gridRowNames()).toEqual(["revenue"]);
    expect(screen.getByText("1 of 7")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText('No fields match "zzz".')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "rev" } });
    await selectTable(/Contact/);
    expect(await screen.findByText("Full Name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search fields by display or logical name")).toHaveValue("");
    expect(statusText()).toHaveTextContent("contact: 1 fields");
  });

  it("opens the details modal with type-specific details and closes it", async () => {
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Account Name" }));

    const dialogTitle = screen.getByRole("heading", { name: "Account Name", level: 3 });
    expect(dialogTitle).toBeInTheDocument();
    expect(screen.getByText("Type the company or business name.")).toBeInTheDocument();
    expect(screen.getByText("Max length")).toBeInTheDocument();
    expect(screen.getByText("160")).toBeInTheDocument();
    expect(screen.getByText("StringType")).toBeInTheDocument();
    expect(screen.getByText("Valid for create")).toBeInTheDocument();
    expect(screen.getByText("Primary name")).toBeInTheDocument();
    expect(screen.queryByText("Related tables")).not.toBeInTheDocument();
    expect(screen.queryByText("Options")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Account Name", level: 3 })).not.toBeInTheDocument();
  });

  it("shows options for a choice and for yes/no", async () => {
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Industry" }));

    expect(screen.getByText("account_industrycode")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Agriculture")).toBeInTheDocument();
    expect(screen.getByText("Accounting (1)")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Do not allow emails" }));
    expect(screen.getByText("Do Not Allow")).toBeInTheDocument();
    expect(screen.getAllByText("Allow").length).toBeGreaterThan(0);
  });

  it("follows a related table link and clears a table search that hides it", async () => {
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Primary Contact" }));

    expect(screen.getByText("account_primary_contact")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search by display or logical name"), {
      target: { value: "acc" },
    });
    expect(within(screen.getByRole("list", { name: "Tables" })).queryByRole("button", { name: /Contact/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "contact" }));

    expect(await screen.findByText("Full Name")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Primary Contact", level: 3 })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by display or logical name")).toHaveValue("");
    const list = screen.getByRole("list", { name: "Tables" });
    expect(within(list).getByRole("button", { name: /Contact/ })).toHaveAttribute("aria-current", "true");
  });

  it("copies logical and schema names", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Account Name" }));

    fireEvent.click(within(screen.getByRole("heading", { name: "Account Name", level: 3 }).closest("div")!.parentElement!)
      .getByRole("button", { name: "Copy schema name" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Name"));
    expect(await screen.findByTestId("copied-icon")).toBeInTheDocument();

    const copyLogical = screen.getAllByRole("button", { name: "Copy logical name" });
    fireEvent.click(copyLogical[copyLogical.length - 1]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("name"));
  });

  it("refreshes tables and fields, keeps selection and searches, and shows a toast", async () => {
    let tableCalls = 0;
    let attributeCalls = 0;
    httpServer.use(
      http.get(tablesUrl, () => {
        tableCalls += 1;
        return HttpResponse.json(tablesFixture);
      }),
      http.get(attributesUrl, ({ params }) => {
        attributeCalls += 1;
        return responseFor(params.name);
      }),
    );
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");
    fireEvent.change(screen.getByPlaceholderText("Search by display or logical name"), {
      target: { value: "acc" },
    });
    fireEvent.change(screen.getByPlaceholderText("Search fields by display or logical name"), {
      target: { value: "revenue" },
    });
    expect(tableCalls).toBe(1);
    expect(attributeCalls).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));

    await waitFor(() => expect(document.querySelector("[data-toast-type='success']")).toHaveTextContent("Metadata refreshed"));
    expect(tableCalls).toBe(2);
    expect(attributeCalls).toBe(2);
    expect(screen.getByPlaceholderText("Search by display or logical name")).toHaveValue("acc");
    expect(screen.getByPlaceholderText("Search fields by display or logical name")).toHaveValue("revenue");
    expect(gridRowNames()).toEqual(["revenue"]);
  });

  it("caches tables and fields until refresh", async () => {
    let attributeCalls = 0;
    httpServer.use(
      http.get(attributesUrl, ({ params }) => {
        attributeCalls += 1;
        return responseFor(params.name);
      }),
    );
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");
    await selectTable(/Contact/);
    await screen.findByText("Full Name");
    await selectTable(/Account/);
    await screen.findByText("Account Name");

    expect(attributeCalls).toBe(2);
  });

  it("reloads fields of previously viewed tables after refresh", async () => {
    const calls: string[] = [];
    httpServer.use(
      http.get(attributesUrl, ({ params }) => {
        calls.push(String(params.name));
        return responseFor(params.name);
      }),
    );
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");
    await selectTable(/Contact/);
    await screen.findByText("Full Name");

    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));
    await waitFor(() => expect(document.querySelector("[data-toast-type='success']")).toHaveTextContent("Metadata refreshed"));
    expect(calls).toEqual(["account", "contact", "contact"]);

    await selectTable(/Account/);
    await waitFor(() => expect(calls).toEqual(["account", "contact", "contact", "account"]));
  });

  it("clears the selection when refresh no longer returns the table", async () => {
    let refreshed = false;
    httpServer.use(
      http.get(tablesUrl, () =>
        HttpResponse.json(
          refreshed ? { tables: tablesFixture.tables.filter((t) => t.logicalName !== "account") } : tablesFixture,
        ),
      ),
    );
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");

    refreshed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));

    expect(await screen.findByText("Select a table to see its fields.")).toBeInTheDocument();
    expect(screen.queryByText("Account Name")).not.toBeInTheDocument();
    expect(statusText()).toHaveTextContent("3 tables");
  });

  it("closes the modal when refresh no longer returns the field", async () => {
    let refreshed = false;
    httpServer.use(
      http.get(attributesUrl, () =>
        HttpResponse.json(
          refreshed
            ? {
                ...accountResponse,
                attributes: accountResponse.attributes.filter((a) => a.logicalName !== "revenue"),
              }
            : accountResponse,
        ),
      ),
    );
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Annual Revenue" }));
    expect(screen.getByRole("heading", { name: "Annual Revenue", level: 3 })).toBeInTheDocument();

    refreshed = true;
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));
    await waitFor(() => expect(document.querySelector("[data-toast-type='success']")).not.toBeNull());
    expect(screen.queryByRole("heading", { name: "Annual Revenue", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Annual Revenue" })).not.toBeInTheDocument();
  });

  it("does not retry a failed fields request automatically", async () => {
    let calls = 0;
    httpServer.use(
      http.get(attributesUrl, () => {
        calls += 1;
        return HttpResponse.json(
          { code: "table_not_found", message: "This table no longer exists. Refresh metadata." },
          { status: 404 },
        );
      }),
    );
    renderTool();
    await selectTable(/Account/);

    expect(await screen.findByRole("alert")).toHaveTextContent("This table no longer exists.");
    expect(calls).toBe(1);
  });

  it("keeps a table picked while refresh is running", async () => {
    let refreshing = false;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    httpServer.use(
      http.get(tablesUrl, async () => {
        if (!refreshing) return HttpResponse.json(tablesFixture);
        await gate;
        return HttpResponse.json({
          tables: tablesFixture.tables.filter((t) => t.logicalName !== "account"),
        });
      }),
    );
    renderTool();
    await selectTable(/Account/);
    await screen.findByText("Account Name");

    refreshing = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));
    await selectTable(/Contact/);
    release?.();

    await waitFor(() => expect(document.querySelector("[data-toast-type='success']")).not.toBeNull());
    expect(await screen.findByText("Full Name")).toBeInTheDocument();
    expect(screen.queryByText("Select a table to see its fields.")).not.toBeInTheDocument();
  });

  it("does not reopen a field modal that refresh closed", async () => {
    let phase = 0;
    httpServer.use(
      http.get(attributesUrl, () =>
        HttpResponse.json(
          phase === 1
            ? {
                ...accountResponse,
                attributes: accountResponse.attributes.filter((a) => a.logicalName !== "revenue"),
              }
            : accountResponse,
        ),
      ),
    );
    renderTool();
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Annual Revenue" }));
    expect(screen.getByRole("heading", { name: "Annual Revenue", level: 3 })).toBeInTheDocument();

    phase = 1;
    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Annual Revenue", level: 3 })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh metadata" })).toBeEnabled());

    phase = 2;
    fireEvent.click(screen.getByRole("button", { name: "Refresh metadata" }));
    expect(await screen.findByRole("button", { name: "Annual Revenue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Annual Revenue", level: 3 })).not.toBeInTheDocument();
  });

  it("reports a table load failure and retries", async () => {
    let calls = 0;
    httpServer.use(
      http.get(tablesUrl, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "dataverse_error", message: "Read privilege is missing." }, { status: 400 })
          : HttpResponse.json(tablesFixture);
      }),
    );
    renderTool();

    expect(await screen.findByRole("alert")).toHaveTextContent("Read privilege is missing.");
    expect(statusText()).toHaveTextContent("Could not load tables");
    expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent("Read privilege is missing.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Tables" })).toBeInTheDocument();
  });

  it("shows the table_not_found message in the fields pane", async () => {
    httpServer.use(
      http.get(attributesUrl, () =>
        HttpResponse.json(
          { code: "table_not_found", message: "This table no longer exists. Refresh metadata." },
          { status: 404 },
        ),
      ),
    );
    renderTool();
    await selectTable(/Account/);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This table no longer exists. Refresh metadata.",
    );
    expect(statusText()).toHaveTextContent("Could not load fields for account");
    expect(document.querySelector("[data-toast-type='error']")).not.toBeNull();
  });

  it("publishes loading statuses while fields are in flight", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    httpServer.use(
      http.get(attributesUrl, async () => {
        await gate;
        return HttpResponse.json(accountResponse);
      }),
    );
    renderTool();
    await selectTable(/Account/);

    expect(await screen.findByRole("status", { name: "Loading fields" })).toBeInTheDocument();
    await waitFor(() => expect(statusText()).toHaveTextContent("Loading fields for account…"));
    expect(screen.getByRole("button", { name: "Refresh metadata" })).toBeDisabled();
    release?.();
    expect(await screen.findByText("Account Name")).toBeInTheDocument();
  });

  it("resets selection, searches, and modal when the environment changes", async () => {
    function SwitchableTool() {
      const [name, setName] = useState(connection.name);
      return (
        <ConnectionsProvider>
          <StatusBarProvider>
            <button type="button" onClick={() => setName("Other Org")}>
              Switch tab connection
            </button>
            <ToolHost tab={tab(name)} definition={attributeExplorerTool} />
            <StatusItemsProbe />
          </StatusBarProvider>
        </ConnectionsProvider>
      );
    }

    renderWithProviders(<SwitchableTool />, { bridgeOverrides: toolBridge });
    await selectTable(/Account/);
    fireEvent.click(await screen.findByRole("button", { name: "Account Name" }));
    fireEvent.change(screen.getByPlaceholderText("Search by display or logical name"), {
      target: { value: "acc" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch tab connection" }));

    expect(await screen.findByRole("button", { name: /Other Table/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by display or logical name")).toHaveValue("");
    expect(screen.getByText("Select a table to see its fields.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Account Name", level: 3 })).not.toBeInTheDocument();
  });
});
