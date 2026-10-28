import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { legacyConnection } from "../../../../../../test/support/desktopBridge";

import { ConnectionsProvider } from "../../../../shared/connections";
import {
  StatusBarProvider,
  useStatusItems,
} from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { dataMigrationTool } from "../../tool";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const sourceConnection = legacyConnection("Migration Source", "https://source.example.test", "online");

const targetConnection = legacyConnection("Migration Target", "https://target.example.test", "online");

function StatusItemsProbe() {
  const items = useStatusItems();
  return <output aria-label="tool statuses">{items.map((item) => item.content)}</output>;
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const uatConnection = legacyConnection("Migration UAT", "https://uat.example.test", "online");

function mockMigrationApi() {
  const requests: { body: unknown; source: string | null; target: string | null }[] = [];
  httpServer.use(
    http.get("http://localhost/api/metadata/entities", () =>
      HttpResponse.json([
        {
          logicalName: "account",
          displayName: "Account",
          primaryIdAttribute: "accountid",
          primaryNameAttribute: "name",
          isCustom: false,
        },
      ]),
    ),
    http.get("http://localhost/api/metadata/entities/account/attributes", () =>
      HttpResponse.json([
        {
          logicalName: "accountid",
          displayName: "Account",
          attributeType: "Uniqueidentifier",
          isPrimaryId: true,
          isCustomAttribute: false,
          requiredLevel: "SystemRequired",
          isValidForCreate: false,
          isValidForUpdate: false,
        },
        {
          logicalName: "name",
          displayName: "Account Name",
          attributeType: "String",
          isPrimaryId: false,
          isCustomAttribute: false,
          requiredLevel: "ApplicationRequired",
          isValidForCreate: true,
          isValidForUpdate: true,
        },
      ]),
    ),
    http.post("http://localhost/api/migration/run", async ({ request }) => {
      requests.push({
        body: await request.json(),
        source: request.headers.get("X-Environment-Url"),
        target: request.headers.get("X-Target-Environment-Url"),
      });
      return HttpResponse.json({ jobId: `migration-job-${requests.length}` });
    }),
    http.get("http://localhost/api/migration/jobs/:jobId", ({ params }) =>
      HttpResponse.json(
        params.jobId === "migration-job-2"
          ? {
              status: "completed",
              processed: 1,
              total: 1,
              succeeded: 0,
              created: 0,
              updated: 0,
              skipped: 0,
              deleted: 0,
              failed: 1,
              errors: [{ recordId: "record-1", message: "Duplicate name." }],
            }
          : {
              status: "completed",
              processed: 1,
              total: 1,
              succeeded: 1,
              created: 1,
              updated: 0,
              skipped: 0,
              deleted: 0,
              failed: 0,
              errors: [],
            },
      ),
    ),
  );
  return requests;
}

function renderMigration() {
  const connections = [sourceConnection, targetConnection, uatConnection];
  renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: "data-migration-characterization",
            toolId: "data-migration",
            title: "Data Migration",
            connectionId: sourceConnection.id,
          }}
          definition={dataMigrationTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    {
      bridgeOverrides: {
        getActiveConnectionId: async () => sourceConnection.id,
        getActiveConnection: async () => ({
          ...sourceConnection,
          token: "source-active-token",
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
        listConnections: async () => connections,
        getConnection: async (name) => ({
          ...(connections.find((c) => c.id === name) ?? targetConnection),
          token: `${name}-token`,
          expiresOn: "2099-01-01T00:00:00.000Z",
        }),
      },
    },
  );
}

async function addTarget(name: string) {
  const trigger = await screen.findByRole("button", { name: /^Add/ });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

async function selectAccountName() {
  fireEvent.click(await screen.findByRole("button", { name: /Account.*account/ }));
  fireEvent.click(await screen.findByText("Account Name"));
}

describe("Data Migration", () => {
  it("runs the selected entity migration and publishes completed status", async () => {
    const requests = mockMigrationApi();
    renderMigration();

    const sourceSelect = await screen.findByRole("combobox", { name: "Source" });
    await waitFor(() => expect(sourceSelect).toHaveValue(sourceConnection.id));
    await addTarget("Migration Target");
    await selectAccountName();
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration Target" }));

    await waitFor(() =>
      expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
        "✓ account → Migration Target: 1 created · 0 updated",
      ),
    );
    expect(requests).toEqual([
      {
        body: {
          entityLogicalName: "account",
          attributes: ["accountid", "name"],
          create: true,
          update: true,
          delete: false,
        },
        source: sourceConnection.envUrl,
        target: targetConnection.envUrl,
      },
    ]);
  });

  it("migrates to each target in order with the same settings, one click apart", async () => {
    const requests = mockMigrationApi();
    renderMigration();

    await addTarget("Migration Target");
    await addTarget("Migration UAT");
    await selectAccountName();
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration Target" }));

    const banner = await screen.findByText("account migrated to Migration Target");
    expect(banner.closest("[data-tone]")).toHaveAttribute("data-tone", "ok");
    expect(screen.getByText(/Next up: Migration UAT, with the same fields/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Migration Target, Migrated" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Migration UAT, Next" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Targets" })).toHaveTextContent(
      "Targets · 1 of 2 migrated",
    );

    expect(within(banner.closest("[data-tone]") as HTMLElement).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration UAT" }));

    await screen.findByText("account migrated to Migration UAT");
    expect(screen.getByText(/1 failed\. Open Migration UAT above to see why\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Migration UAT, Migrated with errors" })).toBeVisible();
    expect(screen.getByRole("button", { name: "▶ All targets migrated" })).toBeDisabled();
    expect(requests.map((r) => r.target)).toEqual([targetConnection.envUrl, uatConnection.envUrl]);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[1].source).toBe(sourceConnection.envUrl);

    fireEvent.click(screen.getByRole("button", { name: "Migration UAT, Migrated with errors" }));
    expect(await screen.findByText("Duplicate name.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Migrate again" }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].target).toBe(uatConnection.envUrl);
  });

  it("starts again from the first target when the settings change", async () => {
    mockMigrationApi();
    renderMigration();

    await addTarget("Migration Target");
    await addTarget("Migration UAT");
    await selectAccountName();
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration Target" }));
    await screen.findByText("account migrated to Migration Target");

    fireEvent.click(screen.getByRole("checkbox", { name: "Create" }));

    expect(screen.queryByText("account migrated to Migration Target")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Migration Target, Next" })).toBeVisible();
    expect(screen.getByRole("button", { name: "▶ Migrate to Migration Target" })).toBeEnabled();
  });

  it("previews action, id, and name for each record with the total to migrate", async () => {
    mockMigrationApi();
    httpServer.use(
      http.post("http://localhost/api/migration/preview", () =>
        HttpResponse.json({
          records: [
            { id: "11111111-1111-1111-1111-111111111111", name: "Contoso" },
            { id: "22222222-2222-2222-2222-222222222222", name: "Fabrikam" },
          ],
          pagingCookie: null,
          moreRecords: false,
        }),
      ),
      http.post("http://localhost/api/migration/existing", () =>
        HttpResponse.json({ existingIds: ["22222222-2222-2222-2222-222222222222"] }),
      ),
      http.post("http://localhost/api/migration/count/target", () =>
        HttpResponse.json({ count: 1234, existing: 1000 }),
      ),
    );
    renderMigration();

    await addTarget("Migration Target");
    await selectAccountName();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("1,234 records will be migrated")).toBeVisible();
    expect(within(dialog).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Action",
      "ID",
      "Name",
    ]);
    expect(within(dialog).getByRole("combobox", { name: "Compare with" })).toHaveValue(
      targetConnection.id,
    );
    const contoso = (await within(dialog).findByText("Contoso")).closest("tr") as HTMLElement;
    await waitFor(() => expect(within(contoso).getByText("Create")).toBeVisible());
    expect(contoso).toHaveTextContent("11111111-1111-1111-1111-111111111111");
    const fabrikam = within(dialog).getByText("Fabrikam").closest("tr") as HTMLElement;
    expect(within(fabrikam).getByText("Update")).toBeVisible();
    expect(within(dialog).getByText("234 to create · 1,000 to update")).toBeVisible();
    expect(within(dialog).queryByText(/This page/)).not.toBeInTheDocument();
  });

  it("shows existing records as skipped when only Create is on", async () => {
    mockMigrationApi();
    httpServer.use(
      http.post("http://localhost/api/migration/preview", () =>
        HttpResponse.json({
          records: [
            { id: "11111111-1111-1111-1111-111111111111", name: "Contoso" },
            { id: "22222222-2222-2222-2222-222222222222", name: "Fabrikam" },
          ],
          pagingCookie: null,
          moreRecords: false,
        }),
      ),
      http.post("http://localhost/api/migration/existing", () =>
        HttpResponse.json({ existingIds: ["22222222-2222-2222-2222-222222222222"] }),
      ),
      http.post("http://localhost/api/migration/count/target", () =>
        HttpResponse.json({ count: 10, existing: 4 }),
      ),
    );
    renderMigration();

    await addTarget("Migration Target");
    await selectAccountName();
    fireEvent.click(screen.getByRole("checkbox", { name: "Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const dialog = await screen.findByRole("dialog");
    const fabrikam = (await within(dialog).findByText("Fabrikam")).closest("tr") as HTMLElement;
    await waitFor(() => expect(within(fabrikam).getByText("Skip")).toBeVisible());
    const contoso = within(dialog).getByText("Contoso").closest("tr") as HTMLElement;
    expect(within(contoso).getByText("Create")).toBeVisible();
    expect(await within(dialog).findByText("6 to create · 4 skipped (already in the target)")).toBeVisible();
    expect(within(dialog).queryByText(/will fail/)).not.toBeInTheDocument();
  });

  it("explains Delete before turning it on and keeps it off when the user backs out", async () => {
    mockMigrationApi();
    renderMigration();
    await selectAccountName();

    const deleteBox = screen.getByRole("checkbox", { name: "Delete" });
    fireEvent.click(deleteBox);
    const warning = await screen.findByRole("dialog", { name: "Turn on Delete?" });
    expect(within(warning).getByText(/every account record in the target is considered/)).toBeVisible();
    fireEvent.click(within(warning).getByRole("button", { name: "Keep Delete off" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteBox).not.toBeChecked();
    expect(screen.queryByText("Delete is on")).not.toBeInTheDocument();

    fireEvent.click(deleteBox);
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Turn on Delete?" })).getByRole("button", {
        name: "Turn on Delete",
      }),
    );
    await waitFor(() => expect(deleteBox).toBeChecked());
    expect(screen.getByText("Delete is on")).toBeVisible();

    fireEvent.click(deleteBox);
    expect(deleteBox).not.toBeChecked();
  });

  it("lists the records to delete and starts only after the user confirms that number", async () => {
    const requests = mockMigrationApi();
    let deletionTarget: string | null = null;
    httpServer.use(
      http.post("http://localhost/api/migration/deletions", ({ request }) => {
        deletionTarget = request.headers.get("X-Target-Environment-Url");
        return HttpResponse.json({
          count: 2,
          sourceCount: 5,
          records: [
            { id: "33333333-3333-3333-3333-333333333333", name: "Old Contoso" },
            { id: "44444444-4444-4444-4444-444444444444", name: null },
          ],
        });
      }),
    );
    renderMigration();

    await addTarget("Migration Target");
    await selectAccountName();
    fireEvent.click(screen.getByRole("checkbox", { name: "Delete" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Turn on Delete?" })).getByRole("button", {
        name: "Turn on Delete",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration Target" }));

    const confirm = await screen.findByRole("dialog", { name: "Delete records in Migration Target?" });
    expect(await within(confirm).findByText("2 records will be deleted")).toBeVisible();
    expect(within(confirm).getByText("Old Contoso")).toBeVisible();
    expect(within(confirm).getByText("44444444-4444-4444-4444-444444444444")).toBeVisible();
    expect(deletionTarget).toBe(targetConnection.envUrl);
    const go = within(confirm).getByRole("button", { name: "Delete 2 and migrate" });
    expect(go).toBeDisabled();
    expect(requests).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole("checkbox"));
    expect(go).toBeEnabled();
    fireEvent.click(go);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({
      entityLogicalName: "account",
      attributes: ["accountid", "name"],
      create: true,
      update: true,
      delete: true,
      confirmedDeleteCount: 2,
    });
  });

  it("does not migrate with Delete when the source returns no records", async () => {
    const requests = mockMigrationApi();
    httpServer.use(
      http.post("http://localhost/api/migration/deletions", () =>
        HttpResponse.json({
          count: 3,
          sourceCount: 0,
          records: [{ id: "33333333-3333-3333-3333-333333333333", name: "Contoso" }],
        }),
      ),
    );
    renderMigration();

    await addTarget("Migration Target");
    await selectAccountName();
    fireEvent.click(screen.getByRole("checkbox", { name: "Delete" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Turn on Delete?" })).getByRole("button", {
        name: "Turn on Delete",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "▶ Migrate to Migration Target" }));

    const confirm = await screen.findByRole("dialog", { name: "Delete records in Migration Target?" });
    expect(await within(confirm).findByText("The source returned no records")).toBeVisible();
    expect(within(confirm).getByRole("button", { name: "Delete 3 and migrate" })).toBeDisabled();
    expect(within(confirm).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(requests).toHaveLength(0);
  });
});
