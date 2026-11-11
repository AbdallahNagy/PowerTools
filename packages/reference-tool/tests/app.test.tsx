import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolClientError, type ConnectionSnapshot, type PowerToolsClient } from "@powertools/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseManifest } from "../../../desktop/src/electron/communityTools/manifest";
import { App } from "../src/App";

afterEach(cleanup);

const TABLES = [
  { logicalName: "account", displayName: "Account", entitySetName: "accounts", primaryIdAttribute: "accountid", primaryNameAttribute: "name", isCustom: false },
  { logicalName: "contact", displayName: "Contact", entitySetName: "contacts", primaryIdAttribute: "contactid", primaryNameAttribute: "fullname", isCustom: false },
];

const COLUMNS = [
  { logicalName: "name", displayName: "Account Name", type: "String", isCustom: false, requiredLevel: "ApplicationRequired", targets: [] },
  { logicalName: "primarycontactid", displayName: "Primary Contact", type: "Lookup", isCustom: false, requiredLevel: "None", targets: ["contact"] },
];

function fakeClient(options: { connection?: ConnectionSnapshot | null; metadata?: Partial<PowerToolsClient["metadata"]> } = {}) {
  const connection = options.connection === undefined ? { displayName: "Contoso", kind: "online" as const } : options.connection;
  const metadata = {
    tables: vi.fn().mockResolvedValue(TABLES),
    columns: vi.fn().mockResolvedValue(COLUMNS),
    ...options.metadata,
  };
  const setStatus = vi.fn().mockResolvedValue(undefined);
  const client = {
    connection: { get: vi.fn().mockResolvedValue(connection), onChange: vi.fn(() => () => undefined) },
    metadata,
    shell: { setStatus },
  } as unknown as PowerToolsClient;
  return { client, metadata, setStatus };
}

describe("Attribute Explorer (reference)", () => {
  it("lists the tables and filters them by search text", async () => {
    const user = userEvent.setup();
    const { client } = fakeClient();
    render(<App client={client} />);

    const list = await screen.findByRole("list", { name: "Tables" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);

    await user.type(screen.getByPlaceholderText("Search tables"), "cont");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    expect(within(list).getByText("contact")).toBeTruthy();
  });

  it("loads the columns of the selected table by logical name", async () => {
    const user = userEvent.setup();
    const { client, metadata } = fakeClient();
    render(<App client={client} />);

    await user.click(await screen.findByRole("button", { name: /contact/i }));

    await waitFor(() => expect(metadata.columns).toHaveBeenCalledWith("contact"));
    expect(await screen.findByText("Account Name")).toBeTruthy();
  });

  it("opens a column's details in a modal", async () => {
    const user = userEvent.setup();
    const { client } = fakeClient();
    render(<App client={client} />);

    await user.click(await screen.findByRole("button", { name: /account/i }));
    await user.click(await screen.findByRole("button", { name: "Primary Contact" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("primarycontactid")).toBeTruthy();
    expect(within(dialog).getByText("Lookup")).toBeTruthy();
  });

  it("shows the message when the host denies the call", async () => {
    const denied = new ToolClientError("PermissionDenied", "This tool is not allowed to read metadata.");
    const { client } = fakeClient({ metadata: { tables: vi.fn().mockRejectedValue(denied) } });
    render(<App client={client} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This tool is not allowed to read metadata.");
  });

  it("shows the empty state and makes no metadata call without a connection", async () => {
    const { client, metadata } = fakeClient({ connection: null });
    render(<App client={client} />);

    expect(await screen.findByText("No environment selected")).toBeTruthy();
    expect(metadata.tables).not.toHaveBeenCalled();
  });

  it("reports the table count in the status bar", async () => {
    const { client, setStatus } = fakeClient();
    render(<App client={client} />);

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith("2 tables"));
  });

  it("reloads the tables when Refresh metadata is clicked", async () => {
    const user = userEvent.setup();
    const { client, metadata } = fakeClient();
    render(<App client={client} />);

    await screen.findByRole("list", { name: "Tables" });
    await user.click(screen.getByRole("button", { name: "Refresh metadata" }));

    await waitFor(() => expect(metadata.tables).toHaveBeenCalledTimes(2));
  });
});

describe("powertools-tool.json", () => {
  it("passes the host's manifest rules", () => {
    const json: unknown = JSON.parse(readFileSync(resolve(__dirname, "../powertools-tool.json"), "utf8"));
    const result = parseManifest(json, "1.3.0");
    expect(result).toMatchObject({ ok: true });
  });
});
