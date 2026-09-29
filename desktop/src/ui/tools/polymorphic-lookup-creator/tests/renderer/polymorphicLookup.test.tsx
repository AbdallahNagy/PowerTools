import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { polymorphicLookupTool } from "../../tool";
import { metadataFixture, solutionsFixture } from "../fixtures";
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
  getConnection: async () => ({
    ...connection,
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

function renderTool() {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: "polymorphic-lookup-creator-test",
            toolId: "polymorphic-lookup-creator",
            title: "Polymorphic Lookup Creator",
          }}
          definition={polymorphicLookupTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides: toolBridge },
  );
}

function readHandlers() {
  return [
    http.get("http://localhost/api/polymorphic-lookups/solutions", () =>
      HttpResponse.json(solutionsFixture),
    ),
    http.get("http://localhost/api/polymorphic-lookups/metadata", () =>
      HttpResponse.json(metadataFixture),
    ),
  ];
}

async function chooseCase() {
  fireEvent.click(await screen.findByText("Contoso Solution"));
  fireEvent.click(await screen.findByText("Case"));
}

async function editCustomer() {
  await chooseCase();
  fireEvent.click(screen.getByText("Customer"));
  await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Customer"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Contact" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Lead" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Account" }).closest("tr")!);
  fireEvent.click(screen.getByRole("checkbox", { name: "Advanced Find" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("heading", { name: "Remove relationships?" })).toBeInTheDocument();
  const saveButtons = screen.getAllByRole("button", { name: "Save" });
  fireEvent.click(saveButtons[saveButtons.length - 1]!);
}

describe("Polymorphic Lookup Creator", () => {
  beforeEach(() => {
    httpServer.use(...readHandlers());
  });

  it("keeps create disabled until two referenced tables and a display name are set", async () => {
    const bodies: unknown[] = [];
    httpServer.use(
      http.post("http://localhost/api/polymorphic-lookups", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ attributeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
      }),
    );
    renderTool();
    await chooseCase();

    expect(screen.getByText("Managed Lookup")).toBeInTheDocument();
    expect(screen.getByText("Managed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New lookup" }));
    expect(screen.queryByRole("checkbox", { name: "Case" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Account" }));
    expect(screen.getByRole("button", { name: "Create lookup" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Contact" }));
    expect(screen.getByRole("button", { name: "Create lookup" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Customer" } });
    expect(screen.getByLabelText("Schema name")).toHaveValue("CustomerId");
    expect(screen.getByRole("button", { name: "Create lookup" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Create lookup" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      solutionUniqueName: "Contoso",
      referencingEntityLogicalName: "incident",
      schemaName: "new_CustomerId",
    });
    expect((bodies[0] as { relationships: unknown[] }).relationships).toHaveLength(2);
    expect(await screen.findByText("Lookup created")).toBeInTheDocument();
    expect(screen.queryByText(/not a polymorphic lookup/i)).not.toBeInTheDocument();
  });

  it("refuses a save that would leave fewer than two referenced tables", async () => {
    renderTool();
    await chooseCase();
    fireEvent.click(screen.getByText("Customer"));
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Customer"));

    fireEvent.click(screen.getByRole("checkbox", { name: "Account" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Contact" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves adds, then deletes, then updates, and reports an earlier step that remains", async () => {
    const calls: Array<{ method: string; path: string; hasSolution: boolean }> = [];
    httpServer.use(
      http.post("http://localhost/api/polymorphic-lookups/relationships", async ({ request }) => {
        const body = (await request.json()) as { solutionUniqueName?: string };
        calls.push({
          method: "POST",
          path: new URL(request.url).pathname,
          hasSolution: typeof body.solutionUniqueName === "string",
        });
        return HttpResponse.json({ schemaName: "new_LeadId" });
      }),
      http.delete("http://localhost/api/polymorphic-lookups/relationships/:schemaName", ({ request }) => {
        calls.push({ method: "DELETE", path: new URL(request.url).pathname, hasSolution: false });
        return HttpResponse.json({ schemaName: "new_incident_contact_customer" });
      }),
      http.put("http://localhost/api/polymorphic-lookups/relationships/:schemaName", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({
          method: "PUT",
          path: new URL(request.url).pathname,
          hasSolution: "solutionUniqueName" in body,
        });
        return HttpResponse.json({ schemaName: "new_incident_account_customer" });
      }),
    );
    renderTool();
    await editCustomer();

    await waitFor(() => expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE", "PUT"]));
    expect(calls[0]?.path).toBe("/api/polymorphic-lookups/relationships");
    expect(calls[0]?.hasSolution).toBe(true);
    expect(calls[1]?.path).toBe("/api/polymorphic-lookups/relationships/new_incident_contact_customer");
    expect(calls[2]?.path).toBe("/api/polymorphic-lookups/relationships/new_incident_account_customer");
    expect(calls[2]?.hasSolution).toBe(false);
    expect(await screen.findByText("Lookup saved")).toBeInTheDocument();
  });

  it("stops after the first fault and says earlier changes remain applied", async () => {
    const calls: string[] = [];
    httpServer.use(
      http.post("http://localhost/api/polymorphic-lookups/relationships", () => {
        calls.push("POST");
        return HttpResponse.json({ schemaName: "new_LeadId" });
      }),
      http.delete("http://localhost/api/polymorphic-lookups/relationships/:schemaName", () => {
        calls.push("DELETE");
        return HttpResponse.json(
          {
            code: "LastPolymorphicRelationshipCannotBeDeleted",
            message: "The last relationship on a polymorphic lookup cannot be deleted.",
          },
          { status: 400 },
        );
      }),
      http.put("http://localhost/api/polymorphic-lookups/relationships/:schemaName", () => {
        calls.push("PUT");
        return HttpResponse.json({ schemaName: "new_incident_account_customer" });
      }),
    );
    renderTool();
    await editCustomer();

    await waitFor(() => expect(calls).toEqual(["POST", "DELETE"]));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
        "Earlier changes remain applied.",
      ),
    );
    expect(screen.getByText("The last relationship on a polymorphic lookup cannot be deleted.")).toBeInTheDocument();
  });

  it("shows DuplicateAttributeSchemaName for fault -2147192813", async () => {
    httpServer.use(
      http.post("http://localhost/api/polymorphic-lookups", () =>
        HttpResponse.json(
          {
            code: "DuplicateAttributeSchemaName",
            message: "DuplicateAttributeSchemaName: a column with this schema name already exists.",
          },
          { status: 400 },
        ),
      ),
    );
    renderTool();
    await chooseCase();
    fireEvent.click(screen.getByRole("button", { name: "New lookup" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Account" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Contact" }));
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create lookup" }));

    expect(
      await screen.findByText("DuplicateAttributeSchemaName: a column with this schema name already exists."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not a polymorphic lookup/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Customer");
  });
});
