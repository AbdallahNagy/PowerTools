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
              failed: 1,
              errors: [{ recordId: "record-1", message: "Duplicate name." }],
            }
          : { status: "completed", processed: 1, total: 1, succeeded: 1, failed: 0, errors: [] },
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
        "✓ account → Migration Target: 1 migrated",
      ),
    );
    expect(requests).toEqual([
      {
        body: { entityLogicalName: "account", attributes: ["accountid", "name"], mode: "upsert" },
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
});
