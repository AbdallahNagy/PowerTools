import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { recycleBinTool } from "../../tool";
import type { DeletedBody, RestoreItem, RestoreResult } from "../../model/types";
import {
  alphaValues,
  binAccount,
  auditPageFixture,
  auditSecondPageFixture,
  binPageFixture,
  projectAlpha,
  projectAttributes,
  projectBeta,
  statusFixture,
  tablesFixture,
  userAvery,
  usersFixture,
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

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge, connectionName: string | null = connection.name) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "recycle-bin-test", toolId: "recycle-bin", title: "Recycle Bin", connectionName }}
          definition={recycleBinTool}
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

const base = "http://localhost/api/recycle-bin";

function defaultHandlers() {
  return [
    http.get(`${base}/status`, () => HttpResponse.json(statusFixture)),
    http.get(`${base}/tables`, () => HttpResponse.json(tablesFixture)),
    http.get(`${base}/users`, () => HttpResponse.json(usersFixture)),
    http.post(`${base}/deleted`, async ({ request }) => {
      const body = (await request.json()) as DeletedBody;
      if (body.source === "bin") return HttpResponse.json(binPageFixture);
      return HttpResponse.json(body.page === 1 ? auditPageFixture : auditSecondPageFixture);
    }),
    http.get(`${base}/records/:table/:id`, () => HttpResponse.json(alphaValues)),
    http.get("http://localhost/api/metadata/entities/:table/attributes", () => HttpResponse.json(projectAttributes)),
  ];
}

function statuses() {
  return screen.getByLabelText("tool statuses");
}

async function chooseTable(value: string) {
  const select = screen.getByLabelText("Table");
  await waitFor(() => expect(within(select).getByRole("option", { name: /Project/ })).toBeInTheDocument());
  fireEvent.change(select, { target: { value } });
}

function rowFor(name: string) {
  return screen.getByRole("checkbox", { name: `Select ${name}` }).closest("tr")!;
}

describe("Recycle Bin", () => {
  beforeEach(() => {
    httpServer.use(...defaultHandlers());
  });

  it("asks for an environment and loads nothing", async () => {
    let calls = 0;
    httpServer.use(http.get(`${base}/tables`, () => {
      calls += 1;
      return HttpResponse.json(tablesFixture);
    }));
    renderTool({ ...toolBridge, getActiveConnectionName: async () => null }, null);

    expect(await screen.findByText("Select an environment")).toBeInTheDocument();
    expect(screen.getByLabelText("Table")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Find deleted records" })).toBeDisabled();
    expect(statuses()).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("lists a table's recycle bin without date or user filters", async () => {
    const bodies: DeletedBody[] = [];
    httpServer.use(http.post(`${base}/deleted`, async ({ request }) => {
      bodies.push((await request.json()) as DeletedBody);
      return HttpResponse.json(binPageFixture);
    }));
    renderTool();

    expect(await screen.findByText("Choose a table and a date range, then find deleted records.")).toBeInTheDocument();
    await chooseTable("account");

    expect(screen.getByLabelText("Source")).toHaveTextContent("Recycle bin, keeps records 30 days");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Deleted by")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));

    expect(await screen.findByRole("heading", { name: "Deleted Account" })).toBeInTheDocument();
    expect(bodies[0]).toMatchObject({ source: "bin", table: "account", fromUtc: null, toUtc: null, page: 1 });
    expect(screen.getByText("Flow Integration")).toBeInTheDocument();
    await waitFor(() => expect(statuses()).toHaveTextContent("1 deleted record"));

    fireEvent.click(screen.getByText("Contoso"));
    expect(
      await screen.findByText("These are the values the record had when it was deleted. Restoring brings all of them back."),
    ).toBeInTheDocument();
  });

  it("finds audit log deletions in a date range by user and pages through them", async () => {
    const bodies: DeletedBody[] = [];
    httpServer.use(http.post(`${base}/deleted`, async ({ request }) => {
      const body = (await request.json()) as DeletedBody;
      bodies.push(body);
      return HttpResponse.json(body.page === 1 ? auditPageFixture : auditSecondPageFixture);
    }));
    renderTool();
    await chooseTable("new_project");

    expect(screen.getByLabelText("Source")).toHaveTextContent("Audit log, keeps entries 90 days");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
    expect(screen.getByText("To must be on or after From.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find deleted records" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-11" } });
    const deletedBy = screen.getByLabelText("Deleted by");
    expect(within(deletedBy).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Anyone",
      "Avery Admin (disabled)",
      "Flow Integration",
    ]);
    fireEvent.change(deletedBy, { target: { value: userAvery } });
    fireEvent.keyDown(deletedBy, { key: "Enter" });

    expect(await screen.findByRole("heading", { name: "Deleted Project" })).toBeInTheDocument();
    expect(bodies[0]).toMatchObject({
      source: "audit",
      table: "new_project",
      fromUtc: new Date(2026, 9, 1).toISOString(),
      toUtc: new Date(2026, 9, 12).toISOString(),
      deletedByUserId: userAvery,
      pagingCookie: null,
    });

    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[1]!.textContent);
    expect(names).toEqual(["Beta", "Alpha", "(No name)"]);
    expect(screen.getByRole("checkbox", { name: "Select (No name)" })).toBeDisabled();
    expect(screen.getByText("Showing 3 records. More match these filters. Sorting applies to the loaded records only."))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("4 records")).toBeInTheDocument());
    expect(bodies[1]).toMatchObject({ page: 2, pagingCookie: auditPageFixture.pagingCookie });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-10" } });
    expect(screen.getByText("Filters changed. Find again to update the list.")).toBeInTheDocument();
  });

  it("shows the values a record had, with labels and a field filter", async () => {
    renderTool();
    await chooseTable("new_project");
    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));
    fireEvent.click(await screen.findByText("Alpha"));

    expect(await screen.findByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Contoso")).toBeInTheDocument();
    expect(screen.getByText(/Only audited fields that had a value appear here/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter fields"), { target: { value: "billable" } });
    expect(screen.queryByText("Build")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter fields"), { target: { value: "zzz" } });
    expect(screen.getByText("No fields match the filter.")).toBeInTheDocument();
  });

  it("restores checked records, reports a partial failure, and keeps failed rows checked", async () => {
    const restored: RestoreItem[][] = [];
    httpServer.use(http.post(`${base}/restore`, async ({ request }) => {
      const body = (await request.json()) as { source: string; items: RestoreItem[] };
      expect(body.source).toBe("audit");
      restored.push(body.items);
      const results: RestoreResult[] = body.items.map((item) => ({
        ...item,
        status: item.recordId === projectBeta.recordId ? "failed" : "restored",
        code: item.recordId === projectBeta.recordId ? "DuplicateRecord" : null,
        message: item.recordId === projectBeta.recordId ? "Cannot insert duplicate key." : null,
        warning: null,
      }));
      return HttpResponse.json({ results });
    }));
    renderTool();
    await chooseTable("new_project");
    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("4 records")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all records" }));
    expect(screen.getByRole("button", { name: "Restore (3)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore (3)" }));

    const dialog = await screen.findByRole("dialog", { name: "Restore deleted records" });
    expect(within(dialog).getByText("1 record was deleted more than once. Only the most recent deletion of each is restored."))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/Fields that were not audited/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore 2 records" }));

    expect(await within(dialog).findByText("1 restored, 1 failed")).toBeInTheDocument();
    expect(within(dialog).getByText("A record with this ID already exists.")).toBeInTheDocument();
    // Oldest deletion first, and only the latest deletion of Alpha.
    expect(restored).toEqual([[
      { table: "new_project", recordId: projectAlpha.recordId, auditId: projectAlpha.auditId },
      { table: "new_project", recordId: projectBeta.recordId, auditId: projectBeta.auditId },
    ]]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("1 of 2 records could not be restored.")).toBeInTheDocument();
    expect(within(rowFor("Beta")).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Beta" })).toBeChecked();
    const alphaRows = screen.getAllByRole("checkbox", { name: "Select Alpha" });
    expect(alphaRows.map((box) => within(box.closest("tr")!).queryByText("Restored") !== null)).toContain(true);
    expect(statuses()).toHaveTextContent("1 restored, 1 failed");

    // Retrying the failed row tells the sidecar it is a retry; a record that came back is "Already restored".
    httpServer.use(http.post(`${base}/restore`, async ({ request }) => {
      const body = (await request.json()) as { items: RestoreItem[] };
      restored.push(body.items);
      return HttpResponse.json({
        results: body.items.map((item) => ({
          ...item,
          status: "alreadyRestored",
          code: null,
          message: "Already restored",
          warning: null,
        })),
      });
    }));
    fireEvent.click(screen.getByRole("button", { name: "Restore (1)" }));
    const retryDialog = await screen.findByRole("dialog", { name: "Restore deleted records" });
    fireEvent.click(within(retryDialog).getByRole("button", { name: "Restore 1 records" }));
    expect(await within(retryDialog).findByText("0 restored, 0 failed, 1 already restored")).toBeInTheDocument();
    expect(restored[1]).toEqual([
      { table: "new_project", recordId: projectBeta.recordId, auditId: projectBeta.auditId, retry: true },
    ]);
    fireEvent.click(within(retryDialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(rowFor("Beta")).getByText("Already restored")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Beta" })).not.toBeChecked();
  });

  it("switches a table that is in the recycle bin to the audit log", async () => {
    const bodies: DeletedBody[] = [];
    httpServer.use(http.post(`${base}/deleted`, async ({ request }) => {
      bodies.push((await request.json()) as DeletedBody);
      return HttpResponse.json({ ...auditPageFixture, moreRecords: false });
    }));
    renderTool();
    await chooseTable("account");

    const binButton = screen.getByRole("button", { name: "Recycle bin" });
    const auditButton = screen.getByRole("button", { name: "Audit log" });
    expect(binButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();

    fireEvent.click(auditButton);
    expect(auditButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Source")).toHaveTextContent("Audit log, keeps entries 90 days");
    expect(screen.getByLabelText("Source")).toHaveTextContent(
      "Records that are still in the recycle bin are skipped when restoring.",
    );
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("Deleted by")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));
    await screen.findByRole("heading", { name: "Deleted Account" });
    expect(bodies[0]).toMatchObject({ source: "audit", table: "account" });
    expect(bodies[0]!.fromUtc).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    await screen.findByRole("heading", { name: "Deleted Account" });
    expect(screen.queryByText("Filters changed. Find again to update the list.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recycle bin" }));
    expect(screen.getByText("Filters changed. Find again to update the list.")).toBeInTheDocument();

    // A table with only one source shows no switch, and choosing a table goes back to the recycle bin.
    await chooseTable("new_project");
    expect(screen.queryByRole("button", { name: "Recycle bin" })).not.toBeInTheDocument();
    await chooseTable("account");
    expect(screen.getByRole("button", { name: "Recycle bin" })).toHaveAttribute("aria-pressed", "true");
  });

  it("re-checks the recycle bin between chunks and skips records that already came back", async () => {
    const records = Array.from({ length: 30 }, (_, index) => {
      const id = `33333333-0000-0000-0000-${String(index).padStart(12, "0")}`;
      return { ...binAccount, key: id, recordId: id, name: `Account ${String(index).padStart(2, "0")}` };
    });
    const restoreCalls: RestoreItem[][] = [];
    const checks: string[][] = [];
    httpServer.use(
      http.post(`${base}/deleted`, () => HttpResponse.json({ ...binPageFixture, records })),
      http.post(`${base}/restore`, async ({ request }) => {
        const body = (await request.json()) as { source: string; items: RestoreItem[] };
        expect(body.source).toBe("bin");
        restoreCalls.push(body.items);
        return HttpResponse.json({
          results: body.items.map((item) => ({ ...item, status: "restored", code: null, message: null, warning: null })),
        });
      }),
      http.post(`${base}/bin-check`, async ({ request }) => {
        const body = (await request.json()) as { table: string; recordIds: string[] };
        expect(body.table).toBe("account");
        checks.push(body.recordIds);
        // Records 25 and 26 came back with an earlier restore (cascade).
        return HttpResponse.json({ inBin: body.recordIds.filter((id) => !id.endsWith("25") && !id.endsWith("26")) });
      }),
    );
    renderTool();
    await chooseTable("account");
    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));
    await screen.findByText("30 records");
    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all records" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore (30)" }));
    const dialog = await screen.findByRole("dialog", { name: "Restore deleted records" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore 30 records" }));

    expect(await within(dialog).findByText("28 restored, 0 failed, 2 already restored")).toBeInTheDocument();
    expect(restoreCalls.map((items) => items.length)).toEqual([25, 3]);
    expect(checks).toEqual([records.slice(25).map((row) => row.recordId)]);
    expect(within(dialog).getAllByText("Already restored")).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(await screen.findByText("28 records restored.")).toBeInTheDocument();
    expect(within(rowFor("Account 25")).getByText("Already restored")).toBeInTheDocument();
  });

  it("shows a permission message without Try again when audit history cannot be read", async () => {
    httpServer.use(http.post(`${base}/deleted`, () =>
      HttpResponse.json({ code: "PrivilegeDenied", message: "Principal lacks prvReadAuditSummary." }, { status: 403 })));
    renderTool();
    await chooseTable("new_project");
    fireEvent.click(screen.getByRole("button", { name: "Find deleted records" }));

    expect(await screen.findByText("You do not have permission to read audit history in this environment."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("explains when no table has the recycle bin or auditing on", async () => {
    httpServer.use(http.get(`${base}/tables`, () => HttpResponse.json({ tables: [] })));
    renderTool();

    expect(await screen.findByText("No tables have the recycle bin or auditing turned on in this environment."))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload tables" })).toBeInTheDocument();
  });
});
