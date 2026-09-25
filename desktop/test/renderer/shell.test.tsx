import { useEffect, type ReactNode } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import ActivityBar from "../../src/ui/components/layout/ActivityBar";
import Layout from "../../src/ui/components/layout/Layout";
import StatusBar from "../../src/ui/components/layout/StatusBar";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";
import { TOOL_REGISTRY } from "../../src/ui/tools/registry";
import { ConnectionsProvider } from "../../src/ui/shared/connections";
import { StatusBarProvider, useStatusBar } from "../../src/ui/shared/status";
import { renderWithProviders } from "../support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
      <output aria-label="open tab IDs">{tabs.map((tab) => tab.id).join(" | ")}</output>
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

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

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

  it("keeps instance IDs unique when two tools open in the same millisecond", async () => {
    vi.spyOn(Date, "now").mockReturnValue(303);

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
    fireEvent.click(fetchXmlBuilder);
    fireEvent.click(fetchXmlBuilder);

    expect(screen.getByRole("status", { name: "open tab IDs" })).toHaveTextContent(
      "welcome | fetchxml-builder-303 | fetchxml-builder-303-2",
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

  it("lists tools with icon and name and filters them from the sidebar search", async () => {
    renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ActivityBar />
        </TabProvider>
      </ConnectionsProvider>,
    );

    const dataMigration = await screen.findByRole("button", { name: "data migration" });
    expect(dataMigration).toHaveTextContent("Data Migration");
    expect(
      screen.getByRole("button", { name: "Build, run, and refine FetchXML queries" }),
    ).toHaveTextContent("FetchXML Builder");
    const connection = screen.getByRole("button", { name: "Not connected" });
    expect(
      dataMigration.compareDocumentPosition(connection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), {
      target: { value: "fetch" },
    });

    expect(
      screen.getByRole("button", { name: "Build, run, and refine FetchXML queries" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "data migration" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not connected" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search tools" }), {
      target: { value: "no-such-tool" },
    });
    expect(screen.getByText("No matching tools")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not connected" })).toBeInTheDocument();
  });

  it("toggles the resizable sidebar from the title bar", async () => {
    renderWithProviders(
      <TabProvider>
        <Layout />
      </TabProvider>,
    );

    expect(await screen.findByRole("navigation", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));

    expect(screen.queryByRole("navigation", { name: "Tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize sidebar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
    expect(screen.getByRole("navigation", { name: "Tools" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeInTheDocument();
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

  it("pins the connection switcher to the sidebar footer", async () => {
    const listConnections = vi.fn(async () => [
      {
        name: "Primary",
        envUrl: "https://primary.example.test",
        crmType: "online" as const,
      },
      {
        name: "Secondary",
        envUrl: "https://secondary.example.test",
        crmType: "online" as const,
      },
    ]);
    const getActiveConnectionName = vi.fn(async () => "Primary");
    const createConnectionWindow = vi.fn(async () => undefined);
    const setActiveConnection = vi.fn(async () => ({ success: true as const }));
    const { bridge } = renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ActivityBar />
        </TabProvider>
        <StatusBarProvider>
          <StatusBar />
        </StatusBarProvider>
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnectionName,
          listConnections,
          createConnectionWindow,
          setActiveConnection,
        },
      },
    );

    const connection = await screen.findByRole("button", { name: "Connection: Primary" });
    expect(connection).toHaveTextContent("Primary");
    expect(screen.getByText("connected to: Primary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "connected to: Primary" })).not.toBeInTheDocument();
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(getActiveConnectionName).toHaveBeenCalledTimes(1);

    act(() => bridge.emitConnectionStatusUpdate("Secondary"));
    expect(screen.getByRole("button", { name: "Connection: Secondary" })).toHaveTextContent(
      "Secondary",
    );
    expect(screen.getByText("connected to: Secondary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connection: Secondary" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Primary" }));
    expect(setActiveConnection).toHaveBeenCalledWith("Primary");

    fireEvent.click(await screen.findByRole("button", { name: "Connection: Primary" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add connection" }));
    expect(createConnectionWindow).toHaveBeenCalledTimes(1);
  });
});
