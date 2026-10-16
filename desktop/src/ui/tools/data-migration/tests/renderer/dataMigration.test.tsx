import { fireEvent, screen, waitFor } from "@testing-library/react";
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

describe("Data Migration", () => {
  it("runs the selected entity migration and publishes completed status", async () => {
    let migrationRequest: unknown;
    let sourceEnvironmentHeader: string | null = null;
    let targetEnvironmentHeader: string | null = null;

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
        migrationRequest = await request.json();
        sourceEnvironmentHeader = request.headers.get("X-Environment-Url");
        targetEnvironmentHeader = request.headers.get("X-Target-Environment-Url");
        return HttpResponse.json({ jobId: "migration-job-1" });
      }),
      http.get("http://localhost/api/migration/jobs/migration-job-1", () =>
        HttpResponse.json({
          status: "completed",
          processed: 1,
          total: 1,
          succeeded: 1,
          failed: 0,
          errors: [],
        }),
      ),
    );

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
          listConnections: async () => [sourceConnection, targetConnection],
          getConnection: async (name) => ({
            ...(name === sourceConnection.id ? sourceConnection : targetConnection),
            token: `${name}-token`,
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    const [sourceSelect, targetSelect] = await screen.findAllByRole("combobox");
    await waitFor(() => expect(sourceSelect).toHaveValue(sourceConnection.id));
    fireEvent.change(targetSelect, { target: { value: targetConnection.id } });

    fireEvent.click(await screen.findByRole("button", { name: /Account.*account/ }));
    fireEvent.click(await screen.findByText("Account Name"));
    fireEvent.click(screen.getByRole("button", { name: "▶ Start Migration" }));

    await waitFor(() => expect(migrationRequest).toBeDefined());
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
        "✓ account: 1 migrated",
      ),
    );
    expect(migrationRequest).toEqual({
      entityLogicalName: "account",
      attributes: ["accountid", "name"],
      mode: "upsert",
    });
    expect(sourceEnvironmentHeader).toBe(sourceConnection.envUrl);
    expect(targetEnvironmentHeader).toBe(targetConnection.envUrl);
  });
});
