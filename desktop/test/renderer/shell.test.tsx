import { useEffect, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ActivityBar from "../../src/ui/components/layout/ActivityBar";
import StatusBar from "../../src/ui/components/layout/StatusBar";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";
import { TOOL_REGISTRY } from "../../src/ui/tools/registry";
import { ConnectionsProvider } from "../../src/ui/shared/connections";
import { StatusBarProvider, useStatusBar } from "../../src/ui/shared/status";
import { renderWithProviders } from "../support/render";

function TabState() {
  const { activeTabId, closeTab, openTool, tabs } = useTabs();

  return (
    <>
      <button type="button" onClick={() => openTool("welcome")}>
        Open Welcome
      </button>
      <button type="button" onClick={() => closeTab(activeTabId)}>
        Close active tab
      </button>
      <output aria-label="open tab titles">{tabs.map((tab) => tab.title).join(" | ")}</output>
      <output aria-label="active tab">{activeTabId}</output>
    </>
  );
}

function StatusPublisher({ id, children }: { id: string; children: ReactNode }) {
  const { clearStatus, setStatus } = useStatusBar();

  useEffect(() => {
    setStatus(id, children);
    return () => clearStatus(id);
  }, [children, clearStatus, id, setStatus]);

  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderer shell", () => {
  it("projects activity tools in order and opens named FetchXML Builder instances", async () => {
    const now = vi.spyOn(Date, "now");

    renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ActivityBar />
          <TabState />
        </TabProvider>
      </ConnectionsProvider>,
    );

    const dataMigration = await screen.findByRole("button", { name: "data migration" });
    const fetchXmlBuilder = screen.getByRole("button", {
      name: "Build, run, and refine FetchXML queries",
    });

    expect(
      dataMigration.compareDocumentPosition(fetchXmlBuilder) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("button", { name: "Welcome" })).not.toBeInTheDocument();
    expect(TOOL_REGISTRY["metadata-explorer"]).toBeUndefined();
    expect(TOOL_REGISTRY["fetchxml-builder"].component.name).toBe("FetchXmlBuilder");

    now.mockReturnValue(101);
    fireEvent.click(fetchXmlBuilder);
    now.mockReturnValue(202);
    fireEvent.click(fetchXmlBuilder);

    expect(screen.getByRole("status", { name: "open tab titles" }).textContent).toBe(
      "Welcome | FetchXML Builder | FetchXML Builder 2",
    );
    expect(screen.getByRole("status", { name: "active tab" }).textContent).toBe(
      "fetchxml-builder-202",
    );
  });

  it("activates the left tab when the active second instance closes", async () => {
    const now = vi.spyOn(Date, "now");

    renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ActivityBar />
          <TabState />
        </TabProvider>
      </ConnectionsProvider>,
    );

    const fetchXmlBuilder = await screen.findByRole("button", {
      name: "Build, run, and refine FetchXML queries",
    });
    now.mockReturnValue(301);
    fireEvent.click(fetchXmlBuilder);
    now.mockReturnValue(302);
    fireEvent.click(fetchXmlBuilder);
    fireEvent.click(screen.getByRole("button", { name: "Close active tab" }));

    expect(screen.getByRole("status", { name: "open tab titles" }).textContent).toBe(
      "Welcome | FetchXML Builder",
    );
    expect(screen.getByRole("status", { name: "active tab" }).textContent).toBe(
      "fetchxml-builder-301",
    );
  });

  it("activates the existing singleton Welcome tab without adding another", async () => {
    const now = vi.spyOn(Date, "now");

    renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ActivityBar />
          <TabState />
        </TabProvider>
      </ConnectionsProvider>,
    );

    now.mockReturnValue(401);
    fireEvent.click(await screen.findByRole("button", { name: "data migration" }));
    expect(screen.getByRole("status", { name: "active tab" }).textContent).toBe(
      "data-migration-401",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Welcome" }));

    expect(screen.getByRole("status", { name: "open tab titles" }).textContent).toBe(
      "Welcome | Data Migration",
    );
    expect(screen.getByRole("status", { name: "active tab" }).textContent).toBe("welcome");
  });

  it("replaces status content by ID and removes only the unmounted publisher", async () => {
    const firstStatus = <span role="status" aria-label="first publisher status">First status</span>;
    const updatedFirstStatus = <span role="status" aria-label="first publisher status">Updated first status</span>;
    const secondStatus = <span role="status" aria-label="second publisher status">Second status</span>;
    const { rerender } = renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <StatusPublisher id="first">{firstStatus}</StatusPublisher>
          <StatusPublisher id="second">{secondStatus}</StatusPublisher>
          <StatusBar />
        </StatusBarProvider>
      </ConnectionsProvider>,
    );

    expect(await screen.findByRole("status", { name: "first publisher status" })).toHaveTextContent("First status");
    expect(screen.getByRole("status", { name: "second publisher status" })).toHaveTextContent("Second status");

    rerender(
      <ConnectionsProvider>
        <StatusBarProvider>
          <StatusPublisher id="first">{updatedFirstStatus}</StatusPublisher>
          <StatusPublisher id="second">{secondStatus}</StatusPublisher>
          <StatusBar />
        </StatusBarProvider>
      </ConnectionsProvider>,
    );

    expect(screen.getByRole("status", { name: "first publisher status" })).toHaveTextContent(
      "Updated first status",
    );
    expect(screen.getByRole("status", { name: "second publisher status" })).toHaveTextContent("Second status");

    rerender(
      <ConnectionsProvider>
        <StatusBarProvider>
          <StatusPublisher id="first">{updatedFirstStatus}</StatusPublisher>
          <StatusBar />
        </StatusBarProvider>
      </ConnectionsProvider>,
    );

    expect(screen.getByRole("status", { name: "first publisher status" })).toHaveTextContent(
      "Updated first status",
    );
    expect(screen.queryByRole("status", { name: "second publisher status" })).not.toBeInTheDocument();
  });

  it("uses one shared connection load while preserving StatusBar updates", async () => {
    const listConnections = vi.fn(async () => [
      {
        name: "Primary",
        envUrl: "https://primary.example.test",
        crmType: "online" as const,
      },
    ]);
    const getActiveConnectionName = vi.fn(async () => "Primary");
    const { bridge } = renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <StatusBar />
        </StatusBarProvider>
      </ConnectionsProvider>,
      { bridgeOverrides: { getActiveConnectionName, listConnections } },
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connected: (Primary)" })).toBeInTheDocument();
    });
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(getActiveConnectionName).toHaveBeenCalledTimes(1);

    act(() => bridge.emitConnectionStatusUpdate("Secondary"));

    expect(screen.getByRole("button", { name: "Connected: (Secondary)" })).toBeInTheDocument();
  });
});
