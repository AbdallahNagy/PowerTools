import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { solutionComponentsMoverTool } from "../../tool";
import {
  alphaId,
  betaId,
  componentTypesFixture,
  mixedJob,
  refusedJob,
  solutionsFixture,
} from "../fixtures";
import type { ComponentTypesResponse, SolutionsResponse, StartCopyRequest } from "../../model/types";
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

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: "solution-components-mover-test",
            toolId: "solution-components-mover",
            title: "Solution Components Mover",
          }}
          definition={solutionComponentsMoverTool}
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

function solutionsHandler(body: SolutionsResponse = solutionsFixture) {
  return http.get("http://localhost/api/solution-components-mover/solutions", () => HttpResponse.json(body));
}

function typesHandler(body: ComponentTypesResponse = componentTypesFixture) {
  return http.get("http://localhost/api/solution-components-mover/component-types", () => HttpResponse.json(body));
}

async function selectSourceAndTarget() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "Source Alpha Widgets" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Target Beta Flows" }));
}

describe("Solution Components Mover", () => {
  beforeEach(() => {
    httpServer.use(solutionsHandler(), typesHandler());
  });

  it("asks for an environment and does not load solutions", async () => {
    let calls = 0;
    httpServer.use(http.get("http://localhost/api/solution-components-mover/solutions", () => {
      calls += 1;
      return HttpResponse.json(solutionsFixture);
    }));
    renderTool({
      ...toolBridge,
      getActiveConnectionName: async () => null,
    });

    expect(await screen.findAllByText(
      "Select an environment from the connection control at the bottom of the tool sidebar.",
    )).toHaveLength(2);
    const separator = screen.getByRole("separator", { name: "Resize panes" });
    expect(separator).toHaveClass("h-1", "cursor-row-resize");
    expect(screen.getByRole("button", { name: "Copy components" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Open in browser" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh solutions" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Filter solutions")).toBeDisabled();
    expect(screen.queryByText("Copy leaves every source solution unchanged.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("shows managed sources, blocks managed targets, and filters the list", async () => {
    renderTool();
    expect(await screen.findByText("Alpha Widgets")).toBeInTheDocument();
    expect(screen.getByText("Managed Core")).toBeInTheDocument();
    expect(screen.getByText("No copy results")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("3 solutions");
    expect(screen.getByRole("checkbox", { name: /Block a copy that would add a fully included managed table/ })).toBeChecked();

    const managedSource = screen.getByRole("checkbox", { name: "Source Managed Core" });
    const managedTarget = screen.getByRole("checkbox", { name: /A managed solution cannot be a target/ });
    expect(managedSource).toBeEnabled();
    expect(managedTarget).toBeDisabled();
    expect(managedTarget).not.toBeChecked();
    fireEvent.click(managedSource);
    expect(managedSource).toBeChecked();
    expect(managedTarget).not.toBeChecked();
    const managedRow = screen.getByRole("row", { name: /Managed Core/ });
    expect(managedRow).toHaveTextContent("Managed");
    expect(managedRow).not.toHaveTextContent("null");

    fireEvent.change(screen.getByPlaceholderText("Filter solutions"), { target: { value: "unmanaged" } });
    expect(screen.getByText("Alpha Widgets")).toBeInTheDocument();
    expect(screen.getByText("Beta Flows")).toBeInTheDocument();
    expect(screen.queryByText("Managed Core")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter solutions"), { target: { value: "fabrikam" } });
    expect(screen.getByText("Beta Flows")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Widgets")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filter solutions"), { target: { value: "missing" } });
    expect(screen.getByText("No matching solutions")).toBeInTheDocument();
  });

  it("sorts from the column header and keeps title case", async () => {
    renderTool();
    expect(await screen.findByText("Alpha Widgets")).toBeInTheDocument();
    const displayName = screen.getByRole("columnheader", { name: "Display Name" });
    const name = screen.getByRole("columnheader", { name: "Name" });
    expect(displayName).toHaveAttribute("aria-sort", "ascending");
    expect(displayName).toHaveTextContent("↑");
    expect(name).toHaveTextContent("Name");
    expect(name).not.toHaveTextContent("↑");
    expect(displayName.className).not.toMatch(/uppercase/);
    expect(screen.queryByRole("button", { name: /Friendly name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unique name/ })).not.toBeInTheDocument();

    const installed = screen.getByRole("button", { name: "Installed" });
    fireEvent.click(installed);
    let rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Managed Core");
    expect(rows[2]).toHaveTextContent("Alpha Widgets");
    expect(screen.getByRole("columnheader", { name: "Installed" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Installed" })).toHaveTextContent("↑");

    fireEvent.click(installed);
    rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Beta Flows");
    expect(screen.getByRole("columnheader", { name: "Installed" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Installed" })).toHaveTextContent("↓");
  });

  it("reloads solutions from the refresh button", async () => {
    let calls = 0;
    httpServer.use(http.get("http://localhost/api/solution-components-mover/solutions", () => {
      calls += 1;
      return HttpResponse.json(solutionsFixture);
    }));
    renderTool();
    expect(await screen.findByText("Alpha Widgets")).toBeInTheDocument();
    const before = calls;
    fireEvent.click(screen.getByRole("button", { name: "Refresh solutions" }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
    expect(screen.getByText("Alpha Widgets")).toBeInTheDocument();
  });

  it("shows no solutions after an empty load", async () => {
    httpServer.use(solutionsHandler({ solutions: [] }));
    renderTool();
    expect(await screen.findByText("No solutions")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("0 solutions");
    expect(screen.getByRole("button", { name: "Copy components" })).toBeDisabled();
  });

  it("shows a Dataverse load error and retries", async () => {
    let calls = 0;
    httpServer.use(http.get("http://localhost/api/solution-components-mover/solutions", () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { message: "Principal user is missing prvReadSolution privilege." },
          { status: 400 },
        );
      }
      return HttpResponse.json(solutionsFixture);
    }));
    renderTool();

    expect(await screen.findByRole("alert")).toHaveTextContent("prvReadSolution");
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Could not load solutions");
    expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent("prvReadSolution");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Alpha Widgets")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("3 solutions");
  });

  it("copies a component type subset", async () => {
    let body: StartCopyRequest | null = null;
    httpServer.use(http.post("http://localhost/api/solution-components-mover/copies", async ({ request }) => {
      body = await request.json() as StartCopyRequest;
      return HttpResponse.json({ jobId: "job-subset" });
    }));
    httpServer.use(http.get("http://localhost/api/solution-components-mover/copies/:jobId", () =>
      HttpResponse.json(mixedJob)));
    renderTool();
    await selectSourceAndTarget();
    fireEvent.click(screen.getByRole("button", { name: "Copy components" }));
    const account = await screen.findByRole("checkbox", { name: "Account" });
    await waitFor(() => expect(account).toBeChecked());
    const selectAll = screen.getByRole("checkbox", { name: "Select all component types" });
    expect(selectAll).toBeChecked();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invert" })).not.toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const copy = screen.getByRole("button", { name: "Copy" });
    expect(cancel.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Workflow" })).toBeChecked();
    fireEvent.click(account);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      sourceSolutionIds: [alphaId],
      targetSolutionIds: [betaId],
      componentTypes: [29],
      allComponents: false,
      checkBestPractice: true,
    });
    expect(await screen.findByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("The component is already in the solution.")).toBeInTheDocument();
    expect(screen.getByText("Dev Org")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("tool statuses")).toHaveTextContent(
      "Copy finished: 1 succeeded, 1 failed",
    ));
    expect(document.querySelector("[data-toast-type='info']")).toHaveTextContent("Copy finished with failures");
  });

  it("records a best-practice refusal without copy progress", async () => {
    httpServer.use(
      http.post("http://localhost/api/solution-components-mover/copies", () => HttpResponse.json({ jobId: "job-refused" })),
      http.get("http://localhost/api/solution-components-mover/copies/:jobId", () => HttpResponse.json(refusedJob)),
    );
    renderTool();
    await selectSourceAndTarget();
    fireEvent.click(screen.getByRole("button", { name: "Copy components" }));
    const account = await screen.findByRole("checkbox", { name: "Account" });
    await waitFor(() => expect(account).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect((await screen.findAllByText(/unmanaged source includes all assets of a managed table: Account/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Succeeded")).not.toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Copy progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "0");
    await waitFor(() => expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Copy refused"));
    expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent("managed table: Account");
  });

  it("shows an empty component type list and cancels without copying", async () => {
    let posts = 0;
    httpServer.use(
      typesHandler({ componentTypes: [] }),
      http.post("http://localhost/api/solution-components-mover/copies", () => {
        posts += 1;
        return HttpResponse.json({ jobId: "unused" });
      }),
    );
    renderTool();
    await selectSourceAndTarget();
    fireEvent.click(screen.getByRole("button", { name: "Copy components" }));
    expect(await screen.findByText("No component types")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading component types…" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText("tool statuses")).toHaveTextContent("3 solutions"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Component types" })).not.toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it("opens a solution in the browser on double-click", async () => {
    const openExternalUrl = vi.fn(async () => undefined);
    renderTool({ ...toolBridge, openExternalUrl });
    fireEvent.doubleClick(await screen.findByText("Alpha Widgets"));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(
      `https://dev.example.test/tools/solution/edit.aspx?id=${alphaId}`,
    ));
    expect(screen.queryByRole("button", { name: "Open in browser" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-toast-type]")).toBeNull();
  });
});
