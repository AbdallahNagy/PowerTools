import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { bulkWorkflowExecutionTool } from "../../tool";
import {
  accountViewsFixture,
  activeAccountsFetch,
  approveId,
  entitiesFixture,
  jobId,
  myAccountsFetch,
  runFixture,
  workflowsFixture,
} from "../fixtures";
import type { RunState } from "../../model/types";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";
import { codeEditorValue, setCodeEditorValue } from "../../../../../../test/support/codeEditor";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const base = "http://localhost/api/bulk-workflow-execution";

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
            id: "bulk-workflow-execution-1",
            toolId: "bulk-workflow-execution",
            title: "Bulk Workflow Execution",
            connectionName: connection.name,
          }}
          definition={bulkWorkflowExecutionTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides: toolBridge },
  );
}

function setupHandlers(options: {
  count?: () => Response;
  onCount?: (body: unknown) => void;
  onStart?: (body: unknown) => void;
  run?: () => RunState;
  onCancel?: () => void;
} = {}) {
  httpServer.use(
    http.get(`${base}/workflows`, () => HttpResponse.json(workflowsFixture)),
    http.get("http://localhost/api/metadata/entities", () => HttpResponse.json(entitiesFixture)),
    http.get(`${base}/views`, ({ request }) => {
      const entity = new URL(request.url).searchParams.get("entity");
      return HttpResponse.json(entity === "account" ? accountViewsFixture : { views: [] });
    }),
    http.post(`${base}/count`, async ({ request }) => {
      options.onCount?.(await request.json());
      return options.count?.() ?? HttpResponse.json({ count: 1284, entity: "account" });
    }),
    http.post(`${base}/runs`, async ({ request }) => {
      options.onStart?.(await request.json());
      return HttpResponse.json({ jobId });
    }),
    http.get(`${base}/runs/${jobId}`, () => HttpResponse.json(options.run?.() ?? runFixture())),
    http.post(`${base}/runs/${jobId}/cancel`, () => {
      options.onCancel?.();
      return HttpResponse.json(runFixture({ status: "cancelling" }));
    }),
  );
}

function statusBar() {
  return screen.getByRole("status", { name: "tool statuses" });
}

function editor() {
  return screen.getByRole("textbox", { name: "FetchXML" });
}

function startButton() {
  return screen.getByRole("button", { name: "Start" });
}

async function pickWorkflow(name: string) {
  fireEvent.click(await screen.findByText(name));
}

async function countAccounts() {
  await pickWorkflow("Approve account");
  fireEvent.click(await screen.findByText("Active Accounts"));
  fireEvent.click(screen.getByRole("button", { name: "Count records" }));
  expect(await screen.findByText("1,284 records match")).toBeInTheDocument();
}

async function startRun() {
  await countAccounts();
  fireEvent.click(startButton());
  fireEvent.click(screen.getByRole("button", { name: "Start 1,284 workflows" }));
  expect(await screen.findByText("Dev Org", { exact: false })).toBeInTheDocument();
}

describe("Bulk Workflow Execution", () => {
  it("lists workflows, loads views for the picked workflow, and fills the editor from a view", async () => {
    setupHandlers();
    renderTool();

    expect(await screen.findByText("Approve account")).toBeInTheDocument();
    expect(screen.getByText("Recalculate contact")).toBeInTheDocument();
    await waitFor(() => expect(statusBar()).toHaveTextContent("2 on-demand workflows"));
    expect(screen.getByText("Select a workflow to see its views.")).toBeInTheDocument();

    await pickWorkflow("Approve account");
    const activeView = await screen.findByText("Active Accounts");
    const viewRows = activeView.closest("table")!.querySelectorAll("tbody tr");
    expect(viewRows[0]).toHaveTextContent("Active AccountsSystem");
    expect(viewRows[1]).toHaveTextContent("My AccountsPersonal");

    fireEvent.click(screen.getByText("My Accounts"));
    expect(codeEditorValue(editor())).toBe(myAccountsFetch);
    fireEvent.click(activeView);
    expect(codeEditorValue(editor())).toBe(activeAccountsFetch);

    await pickWorkflow("Recalculate contact");
    expect(await screen.findByText("No views for Contact. Paste FetchXML below.")).toBeInTheDocument();
    expect(codeEditorValue(editor())).toBe("");
    expect(screen.getByText("Real-time workflows run inside each batch. Use a smaller batch size.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Batch size" })).toHaveValue(25);
  });

  it("filters workflows by name and entity in the tab", async () => {
    setupHandlers();
    renderTool();
    await screen.findByText("Approve account");

    fireEvent.change(screen.getByPlaceholderText("Filter workflows"), { target: { value: "contact" } });
    expect(screen.queryByText("Approve account")).not.toBeInTheDocument();
    expect(screen.getByText("Recalculate contact")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter workflows"), { target: { value: "nothing" } });
    expect(screen.getByText("No workflows match the filter.")).toBeInTheDocument();
  });

  it("enables Start only after a count for the current workflow and FetchXML", async () => {
    const counts: unknown[] = [];
    setupHandlers({ onCount: (body) => counts.push(body) });
    renderTool();

    await pickWorkflow("Approve account");
    expect(screen.getByRole("button", { name: "Count records" })).toBeDisabled();
    fireEvent.click(await screen.findByText("Active Accounts"));
    expect(startButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Count records" }));
    expect(await screen.findByText("1,284 records match")).toBeInTheDocument();
    expect(counts).toEqual([{ workflowId: approveId, fetchXml: activeAccountsFetch }]);
    expect(startButton()).toBeEnabled();

    setCodeEditorValue(editor(), `${activeAccountsFetch} `);
    expect(startButton()).toBeDisabled();
    expect(screen.queryByText("1,284 records match")).not.toBeInTheDocument();
  });

  it("shows a zero count without enabling Start, and a server error as an error line", async () => {
    let next: () => Response = () => HttpResponse.json({ count: 0, entity: "account" });
    setupHandlers({ count: () => next() });
    renderTool();

    await pickWorkflow("Approve account");
    fireEvent.click(await screen.findByText("Active Accounts"));
    fireEvent.click(screen.getByRole("button", { name: "Count records" }));
    expect(await screen.findByText("No records match. There is nothing to run.")).toBeInTheDocument();
    expect(startButton()).toBeDisabled();

    next = () =>
      HttpResponse.json(
        { code: "EntityMismatch", message: "The query returns contact records, but the workflow runs on account." },
        { status: 400 },
      );
    fireEvent.click(screen.getByRole("button", { name: "Count records" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Error: The query returns contact records, but the workflow runs on account.",
    );
    expect(alert).toHaveAttribute("data-tone", "danger");
    expect(startButton()).toBeDisabled();
  });

  it("confirms the start with the run details and warns for large runs", async () => {
    setupHandlers({ count: () => HttpResponse.json({ count: 12000, entity: "account" }) });
    renderTool();

    await pickWorkflow("Approve account");
    fireEvent.click(await screen.findByText("Active Accounts"));
    fireEvent.click(screen.getByRole("button", { name: "Count records" }));
    await screen.findByText("12,000 records match");
    fireEvent.click(startButton());

    expect(screen.getByText("Start workflows")).toBeInTheDocument();
    const details = within(screen.getByText("Records", { selector: "dt" }).closest("dl")!);
    expect(details.getByText("Approve account")).toBeInTheDocument();
    expect(details.getByText("Background")).toBeInTheDocument();
    expect(details.getByText("Account")).toBeInTheDocument();
    expect(details.getByText("12,000")).toBeInTheDocument();
    expect(details.getByText("100")).toBeInTheDocument();
    expect(details.getByText("0 s")).toBeInTheDocument();
    const warning = screen.getByText(/This queues a large number of workflow jobs\./);
    expect(warning).toHaveTextContent("Warning:");
    expect(warning).toHaveAttribute("data-tone", "warn");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Start workflows")).not.toBeInTheDocument();
  });

  it("starts a run, shows progress and errors, stops after the current batch, and returns to setup", async () => {
    const starts: unknown[] = [];
    let cancels = 0;
    let state = runFixture();
    setupHandlers({
      onStart: (body) => starts.push(body),
      run: () => state,
      onCancel: () => {
        cancels += 1;
        state = runFixture({ status: "cancelling" });
      },
    });
    renderTool();

    await startRun();
    expect(starts).toEqual([
      { workflowId: approveId, fetchXml: activeAccountsFetch, batchSize: 100, delaySeconds: 0 },
    ]);

    expect(await screen.findByText("200 of 1,284")).toBeInTheDocument();
    expect(screen.getByText("Started 199")).toBeInTheDocument();
    expect(screen.getByText("Errors 1")).toBeInTheDocument();
    expect(screen.getByText("About 3 min remaining")).toBeInTheDocument();
    await waitFor(() => expect(statusBar()).toHaveTextContent("Running 200/1,284"));

    const errorTable = screen.getByText("50000000-0000-0000-0000-000000000001").closest("table")!;
    expect(within(errorTable).getByText("Missing privilege (0x80040220)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Stopping after current batch…" })).toBeDisabled();
    await waitFor(() => expect(cancels).toBe(1));

    state = runFixture({ status: "cancelled", processed: 400, succeeded: 398, failed: 2 });
    expect(
      await screen.findByText("Stopped. 398 started, 2 errors, 884 not run.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(statusBar()).toHaveTextContent("Stopped: 398 started, 2 errors"));

    fireEvent.click(screen.getByRole("button", { name: "New run" }));
    expect(codeEditorValue(editor())).toBe(activeAccountsFetch);
    expect(startButton()).toBeDisabled();
    expect(screen.queryByText("1,284 records match")).not.toBeInTheDocument();
  });

  it("shows the failure message and the counts reached when a run fails", async () => {
    setupHandlers({
      run: () =>
        runFixture({
          status: "failed",
          processed: 300,
          succeeded: 290,
          failed: 10,
          message: "Dataverse service protection limits stopped the run.",
          estimatedSecondsRemaining: null,
        }),
    });
    renderTool();

    await startRun();
    const alert = await screen.findByText(/The run failed: Dataverse service protection limits stopped the run\./);
    expect(alert).toHaveTextContent("Error:");
    expect(screen.getByText("290 started, 10 errors, 984 not run.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New run" })).toBeInTheDocument();
    await waitFor(() => expect(statusBar()).toHaveTextContent("Run failed"));
  });

  it("shows the collecting phase and asks the run to stop when the tab closes", async () => {
    let cancels = 0;
    setupHandlers({
      run: () => runFixture({ status: "collecting", total: 0, processed: 0, succeeded: 0, failed: 0, errors: [] }),
      onCancel: () => {
        cancels += 1;
      },
    });
    const view = renderTool();

    await startRun();
    expect(await screen.findByRole("status", { name: "Collecting record IDs…" })).toBeInTheDocument();

    view.unmount();
    await waitFor(() => expect(cancels).toBe(1));
  });
});
