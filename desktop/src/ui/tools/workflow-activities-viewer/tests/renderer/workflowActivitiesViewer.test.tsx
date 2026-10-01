import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { workflowActivitiesTool } from "../../tool";
import {
  activitiesFixture,
  emptyProcessesFixture,
  otherEnvironmentFixture,
  processesFixture,
} from "../fixtures";
import type { WorkflowActivitiesResponse } from "../../model/types";
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

function renderTool(
  bridgeOverrides: DesktopBridgeOverrides = toolBridge,
  connectionName: string | null = connection.name,
) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{
            id: "workflow-activities-viewer-test",
            toolId: "workflow-activities-viewer",
            title: "Workflow Activities Viewer",
            connectionName,
          }}
          definition={workflowActivitiesTool}
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

function activitiesHandler(body: WorkflowActivitiesResponse = activitiesFixture) {
  return http.get("http://localhost/api/workflow-activities", ({ request }) => {
    const environment = request.headers.get("x-environment-url");
    if (environment === "https://other.example.test") return HttpResponse.json(otherEnvironmentFixture);
    return HttpResponse.json(body);
  });
}

function processHandler() {
  return http.get("http://localhost/api/workflow-activities/:pluginTypeId/processes", ({ params }) => {
    if (params.pluginTypeId === "type-3") return HttpResponse.json(emptyProcessesFixture);
    return HttpResponse.json(processesFixture);
  });
}

async function openAssembly(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

describe("Workflow Activities Viewer", () => {
  beforeEach(() => {
    httpServer.use(activitiesHandler(), processHandler());
  });

  it("asks for an environment and does not load activities", async () => {
    let calls = 0;
    httpServer.use(http.get("http://localhost/api/workflow-activities", () => {
      calls += 1;
      return HttpResponse.json(activitiesFixture);
    }));
    renderTool({
      ...toolBridge,
      getActiveConnectionName: async () => null,
    }, null);

    expect(await screen.findAllByText(
      "Right-click this tab and choose Change connection.",
    )).toHaveLength(2);
    expect(screen.getByRole("separator", { name: "Resize panes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Filter by activity name")).toBeDisabled();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("starts collapsed, expands a header, and filters by activity name", async () => {
    renderTool();
    expect(await screen.findByRole("button", { name: /A\.Shared/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contoso helper" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("3 activities in 2 assemblies");

    await openAssembly(/A\.Shared/);
    expect(screen.getByRole("button", { name: "Contoso helper" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter by activity name"), {
      target: { value: "contoso" },
    });
    expect(screen.queryByRole("button", { name: /Contoso\.Activities/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contoso helper" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter by activity name"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No activities match this filter.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByRole("button", { name: "Contoso helper" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contoso\.Activities/ })).toBeInTheDocument();
  });

  it("shows the selected activity, arguments, and activated processes", async () => {
    renderTool();
    await openAssembly(/Contoso\.Activities/);
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));

    expect(await screen.findByRole("columnheader", { name: "Process" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Primary table" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Created on" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Modified on" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Start conditions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add note" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("NoteId")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("2024-03-15 14:30")).toBeInTheDocument();
    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByText(
      "On demand, Record created, Columns changed: statuscode, ownerid, Record deleted",
    )).toBeInTheDocument();
    const globalClose = screen.getByRole("row", { name: /Global close/ });
    expect(globalClose).toHaveTextContent("No start conditions");
    expect(globalClose).not.toHaveTextContent("Reserved");
    expect(screen.queryByText("1.0.0.0")).not.toBeInTheDocument();
    expect(screen.queryByText(/Contoso\.Activities\.AddNote/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Add note: 2 activated processes");
    expect(document.querySelector("[data-toast-type]")).toBeNull();
  });

  it("shows unknown values, empty arguments, and an empty process list", async () => {
    renderTool();
    await openAssembly(/Contoso\.Activities/);
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    expect((await screen.findAllByText("Unknown")).length).toBeGreaterThan(0);
    expect(screen.getByText("No input arguments")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.queryByText("No output arguments")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /A\.Shared/ }));
    fireEvent.click(screen.getByRole("button", { name: "Contoso helper" }));
    expect(await screen.findByText("No activated process references this activity.")).toBeInTheDocument();
    expect(screen.getByText("No input arguments")).toBeInTheDocument();
    expect(screen.getByText("No output arguments")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Contoso helper: no matching processes");
  });

  it("keeps the filter, expansion, and selection across refresh", async () => {
    let processCalls = 0;
    httpServer.use(http.get("http://localhost/api/workflow-activities/:pluginTypeId/processes", ({ params }) => {
      processCalls += 1;
      if (params.pluginTypeId === "type-3") return HttpResponse.json(emptyProcessesFixture);
      return HttpResponse.json(processesFixture);
    }));
    renderTool();
    await openAssembly(/A\.Shared/);
    fireEvent.change(screen.getByPlaceholderText("Filter by activity name"), {
      target: { value: "helper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Contoso helper" }));
    expect(await screen.findByText("No activated process references this activity.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("No activated process references this activity.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by activity name")).toHaveValue("helper");
    expect(screen.getByRole("button", { name: "Contoso helper" })).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(processCalls).toBeGreaterThan(1));
  });

  it("clears the selection when refresh no longer returns that activity", async () => {
    let refreshed = false;
    httpServer.use(http.get("http://localhost/api/workflow-activities", () => {
      if (!refreshed) return HttpResponse.json(activitiesFixture);
      return HttpResponse.json({
        assemblies: [activitiesFixture.assemblies[0]],
      });
    }));
    renderTool();
    await openAssembly(/Contoso\.Activities/);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Escalate case")).toBeInTheDocument();

    refreshed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Select an activity.")).toBeInTheDocument();
    expect(screen.queryByText("Escalate case")).not.toBeInTheDocument();
  });

  it("shows a truncated process list", async () => {
    httpServer.use(http.get("http://localhost/api/workflow-activities/:pluginTypeId/processes", () =>
      HttpResponse.json({ ...processesFixture, truncated: true })));
    renderTool();
    await openAssembly(/Contoso\.Activities/);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("The process list stopped early.")).toBeInTheDocument();
    expect(screen.getByText("Escalate case")).toBeInTheDocument();
  });

  it("reports an activity load failure and retries", async () => {
    let calls = 0;
    httpServer.use(http.get("http://localhost/api/workflow-activities", () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json({ message: "Read privilege is missing." }, { status: 400 });
      }
      return HttpResponse.json(activitiesFixture);
    }));
    renderTool();

    expect(await screen.findByRole("alert")).toHaveTextContent("Read privilege is missing.");
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Could not load workflow activities");
    expect(screen.getByText("Select an activity.")).toBeInTheDocument();
    expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent("Read privilege is missing.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /A\.Shared/ })).toBeInTheDocument();
  });

  it("leaves the activity in place when processes fail", async () => {
    httpServer.use(http.get("http://localhost/api/workflow-activities/:pluginTypeId/processes", () =>
      HttpResponse.json({ message: "The process query failed." }, { status: 429 })));
    renderTool();
    await openAssembly(/Contoso\.Activities/);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The process query failed.");
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Add note: could not load processes");
    expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent("The process query failed.");
  });

  it("reloads when the selected environment changes", async () => {
    function SwitchableTool() {
      const [name, setName] = useState(connection.name);
      return (
        <ConnectionsProvider>
          <StatusBarProvider>
            <button type="button" onClick={() => setName("Other Org")}>
              Switch tab connection
            </button>
            <ToolHost
              tab={{
                id: "workflow-activities-viewer-test",
                toolId: "workflow-activities-viewer",
                title: "Workflow Activities Viewer",
                connectionName: name,
              }}
              definition={workflowActivitiesTool}
            />
            <StatusItemsProbe />
          </StatusBarProvider>
        </ConnectionsProvider>
      );
    }

    renderWithProviders(<SwitchableTool />, { bridgeOverrides: toolBridge });
    expect(await screen.findByRole("button", { name: /A\.Shared/ })).toBeInTheDocument();
    await openAssembly(/A\.Shared/);
    fireEvent.change(screen.getByPlaceholderText("Filter by activity name"), {
      target: { value: "helper" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch tab connection" }));
    expect(await screen.findByRole("button", { name: /Other\.Assembly/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by activity name")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Other activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /A\.Shared/ })).not.toBeInTheDocument();
  });

  it("publishes a loading status while activities are in flight", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    httpServer.use(http.get("http://localhost/api/workflow-activities", async () => {
      await gate;
      return HttpResponse.json(activitiesFixture);
    }));
    renderTool();

    expect(await screen.findByRole("status", { name: "Loading workflow activities" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Loading workflow activities…");
    });
    release?.();
    expect(await screen.findByRole("button", { name: /A\.Shared/ })).toBeInTheDocument();
  });

  it("says when there are no database-stored activities", async () => {
    httpServer.use(http.get("http://localhost/api/workflow-activities", () =>
      HttpResponse.json({ assemblies: [] })));
    renderTool();
    expect(await screen.findByText(
      "No custom workflow activities in database-stored assemblies.",
    )).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("0 activities in 0 assemblies");
  });
});
