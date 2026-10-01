import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ConnectionsProvider,
  useConnections,
} from "../../src/ui/shared/connections";
import { StatusBarProvider } from "../../src/ui/shared/status";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";
import ToolHost from "../../src/ui/shell/tool-runtime/ToolHost";
import { TOOL_REGISTRY } from "../../src/ui/tools/registry";
import { renderWithProviders } from "../support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const availableConnections = [
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
];

function HostedDataMigration() {
  return (
    <ToolHost
      tab={{
        id: "data-migration-test",
        toolId: "data-migration",
        title: "Data Migration",
        connectionName: null,
      }}
      definition={TOOL_REGISTRY["data-migration"]}
    />
  );
}

function OpenToolProbe() {
  const { openTool, tabs } = useTabs();
  return (
    <>
      <button type="button" onClick={() => openTool("fetchxml-builder")}>
        Open FetchXML Builder
      </button>
      <button type="button" onClick={() => openTool("data-migration")}>
        Open Data Migration
      </button>
      <output aria-label="tab connections">
        {tabs
          .filter((tab) => tab.toolId !== "welcome")
          .map((tab) => `${tab.toolId}:${tab.connectionName ?? "none"}`)
          .join("|")}
      </output>
    </>
  );
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

function ConnectionState({ label }: { label: string }) {
  const {
    activeConnectionName,
    connections,
  } = useConnections();

  return (
    <output aria-label={label}>
      {connections.map((connection) => connection.name).join(",")}|
      {activeConnectionName ?? "none"}
    </output>
  );
}

function ConnectionCommands() {
  const {
    createConnectionWindow,
    deleteConnection,
    setActiveConnection,
  } = useConnections();
  const [result, setResult] = useState("none");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const nextResult = await setActiveConnection("Secondary");
          setResult(nextResult.success ? "activated" : nextResult.error ?? "failed");
        }}
      >
        Activate secondary
      </button>
      <button
        type="button"
        onClick={async () => {
          const nextResult = await deleteConnection("Primary");
          setResult(nextResult.success ? "deleted" : nextResult.error ?? "failed");
        }}
      >
        Delete primary
      </button>
      <button type="button" onClick={() => createConnectionWindow()}>
        Add connection
      </button>
      <output aria-label="command result">{result}</output>
      <ConnectionState label="command connection state" />
    </>
  );
}

describe("shared connections", () => {
  it("rejects consumers outside the provider", () => {
    expect(() => renderWithProviders(<ConnectionState label="state" />)).toThrow(
      "useConnections must be used within ConnectionsProvider",
    );
  });

  it("renders consumers while the active connection hydrates", async () => {
    const activeConnection = deferred<string | null>();
    renderWithProviders(
      <ConnectionsProvider>
        <ConnectionState label="connection state" />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnectionName: () => activeConnection.promise,
        },
      },
    );

    expect(screen.getByRole("status", { name: "connection state" })).toHaveTextContent("|none");

    await act(async () => activeConnection.resolve("Primary"));

    expect(screen.getByRole("status", { name: "connection state" })).toHaveTextContent(
      "|Primary",
    );
  });

  it("loads connection state once and shares subsequent updates", async () => {
    const listConnections = vi.fn(async () => [
      {
        name: "Primary",
        envUrl: "https://primary.example.test",
        crmType: "online" as const,
      },
    ]);
    const getActiveConnectionName = vi.fn(async () => "Primary");
    const getActiveConnection = vi.fn(async () => ({
      name: "Primary",
      envUrl: "https://primary.example.test",
      crmType: "online" as const,
    }));
    const { bridge } = renderWithProviders(
      <ConnectionsProvider>
        <ConnectionState label="first connection state" />
        <ConnectionState label="second connection state" />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnection,
          getActiveConnectionName,
          listConnections,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "first connection state" })).toHaveTextContent(
        "Primary|Primary",
      );
    });
    expect(screen.getByRole("status", { name: "second connection state" })).toHaveTextContent(
      "Primary|Primary",
    );
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(getActiveConnectionName).toHaveBeenCalledTimes(1);
    expect(getActiveConnection).not.toHaveBeenCalled();

    act(() => {
      bridge.emitConnectionsUpdated([
        {
          name: "Secondary",
          envUrl: "https://secondary.example.test",
          crmType: "onpremise",
        },
      ]);
      bridge.emitConnectionStatusUpdate("Secondary");
    });

    expect(screen.getByRole("status", { name: "first connection state" })).toHaveTextContent(
      "Secondary|Secondary",
    );
    expect(screen.getByRole("status", { name: "second connection state" })).toHaveTextContent(
      "Secondary|Secondary",
    );
  });

  it("keeps a newer active event when the initial active lookup resolves late", async () => {
    const activeConnection = deferred<string | null>();
    const { bridge } = renderWithProviders(
      <ConnectionsProvider>
        <ConnectionState label="connection state" />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnectionName: () => activeConnection.promise,
        },
      },
    );

    act(() => bridge.emitConnectionStatusUpdate("Secondary"));
    expect(screen.getByRole("status", { name: "connection state" })).toHaveTextContent(
      "|Secondary",
    );

    await act(async () => activeConnection.resolve("Primary"));

    expect(screen.getByRole("status", { name: "connection state" })).toHaveTextContent(
      "|Secondary",
    );
  });

  it("preserves command results and updates the active name after selection", async () => {
    const createConnectionWindow = vi.fn(async () => undefined);
    const deleteConnection = vi.fn(async () => ({
      success: false,
      error: "delete failed",
    }));
    const setActiveConnection = vi.fn(async () => ({
      success: false,
      error: "activate failed",
    }));
    renderWithProviders(
      <ConnectionsProvider>
        <ConnectionCommands />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          createConnectionWindow,
          deleteConnection,
          setActiveConnection,
        },
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Activate secondary" }));
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "command result" })).toHaveTextContent(
        "activate failed",
      );
    });
    expect(screen.getByRole("status", { name: "command connection state" })).toHaveTextContent(
      "|Secondary",
    );
    expect(setActiveConnection).toHaveBeenCalledWith("Secondary");

    fireEvent.click(screen.getByRole("button", { name: "Delete primary" }));
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "command result" })).toHaveTextContent(
        "delete failed",
      );
    });
    expect(deleteConnection).toHaveBeenCalledWith("Primary");

    fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
    expect(createConnectionWindow).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from connection-list updates on unmount", () => {
    const unsubscribe = vi.fn();
    const onConnectionsUpdated = vi.fn(() => unsubscribe);
    const { unmount } = renderWithProviders(
      <ConnectionsProvider>
        <ConnectionState label="state" />
      </ConnectionsProvider>,
      { bridgeOverrides: { onConnectionsUpdated } },
    );

    unmount();

    expect(onConnectionsUpdated).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("lets FetchXML Builder reuse the shared connection load", async () => {
    const listConnections = vi.fn(async () => []);
    const getActiveConnectionName = vi.fn(async () => null);
    renderWithProviders(
      <ConnectionsProvider>
        <ToolHost
          tab={{
            id: "fetchxml-builder-load",
            toolId: "fetchxml-builder",
            title: "FetchXML Builder",
            connectionName: null,
          }}
          definition={TOOL_REGISTRY["fetchxml-builder"]}
        />
      </ConnectionsProvider>,
      { bridgeOverrides: { getActiveConnectionName, listConnections } },
    );

    await waitFor(() => expect(listConnections).toHaveBeenCalled());
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(getActiveConnectionName).toHaveBeenCalledTimes(1);
  });

  it("lets Data Migration reuse the shared connection load and initial active lookup", async () => {
    const listConnections = vi.fn(async () => []);
    const getActiveConnectionName = vi.fn(async () => null);
    renderWithProviders(
      <ConnectionsProvider>
        <StatusBarProvider>
          <HostedDataMigration />
        </StatusBarProvider>
      </ConnectionsProvider>,
      { bridgeOverrides: { getActiveConnectionName, listConnections } },
    );

    await waitFor(() => expect(listConnections).toHaveBeenCalled());
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(getActiveConnectionName).toHaveBeenCalledTimes(1);
  });

  it("stamps new tool tabs with the active connection and leaves them when it changes", async () => {
    const setActiveConnection = vi.fn(async () => ({ success: true as const }));
    const { bridge } = renderWithProviders(
      <ConnectionsProvider>
        <TabProvider>
          <ConnectionState label="connection state" />
          <OpenToolProbe />
        </TabProvider>
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnectionName: async () => "Primary",
          listConnections: async () => availableConnections,
          setActiveConnection,
        },
      },
    );
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "connection state" })).toHaveTextContent(
        "Primary,Secondary|Primary",
      );
    });
    act(() => bridge.emitConnectionStatusUpdate("Secondary"));

    fireEvent.click(screen.getByRole("button", { name: "Open FetchXML Builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Data Migration" }));

    expect(screen.getByRole("status", { name: "tab connections" })).toHaveTextContent(
      "fetchxml-builder:Secondary|data-migration:Secondary",
    );
    expect(setActiveConnection).not.toHaveBeenCalled();

    act(() => bridge.emitConnectionStatusUpdate("Primary"));
    expect(screen.getByRole("status", { name: "tab connections" })).toHaveTextContent(
      "fetchxml-builder:Secondary|data-migration:Secondary",
    );
  });
});
