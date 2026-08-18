import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DragProvider } from "../../src/ui/components/tools/MetadataExplorer/FilterBuilder/DragProvider";
import { useDrag } from "../../src/ui/components/tools/MetadataExplorer/FilterBuilder/useDrag";
import { MetadataExplorerProvider } from "../../src/ui/components/tools/MetadataExplorer/MetadataExplorerProvider";
import { useMetadataExplorer } from "../../src/ui/components/tools/MetadataExplorer/useMetadataExplorer";
import { ToastProvider } from "../../src/ui/components/ui/Toast";
import { useToast } from "../../src/ui/components/ui/useToast";
import { StatusBarProvider } from "../../src/ui/context/StatusBarContext";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useStatusBar } from "../../src/ui/context/useStatusBar";
import { useTabs } from "../../src/ui/context/useTabs";

const root = { id: "root", kind: "group" as const, logic: "and" as const, children: [] };

function ToastControls() {
  const { showToast } = useToast();

  return (
    <>
      <button type="button" onClick={() => showToast("First toast", "success")}>Show first</button>
      <button type="button" onClick={() => showToast("Second toast", "error")}>Show second</button>
    </>
  );
}

function MetadataState() {
  const { connectionName, tables } = useMetadataExplorer();
  return <output aria-label="metadata state">{connectionName}:{tables.length}</output>;
}

function DragState() {
  const { beginDrag, dragId, endDrag } = useDrag();
  return (
    <>
      <button type="button" onClick={() => beginDrag("root")}>Begin drag</button>
      <button type="button" onClick={endDrag}>End drag</button>
      <output aria-label="drag id">{dragId ?? "none"}</output>
    </>
  );
}

function TabState() {
  const { activeTabId, openTool, tabs } = useTabs();
  return (
    <>
      <button type="button" onClick={() => openTool("welcome")}>Open welcome</button>
      <output aria-label="tab state">{activeTabId}:{tabs.length}</output>
    </>
  );
}

function StatusState() {
  const { items, setStatus } = useStatusBar();
  return (
    <>
      <button type="button" onClick={() => setStatus("sync", "Syncing")}>Set status</button>
      <output aria-label="status state">{items.map((item) => item.id).join(",")}</output>
    </>
  );
}

describe("renderer context contracts", () => {
  it("rejects each consumer hook outside its provider", () => {
    expect(() => render(<ToastControls />)).toThrow("useToast must be used within ToastProvider");
    expect(() => render(<MetadataState />)).toThrow("useMetadataExplorer must be used within MetadataExplorerProvider");
    expect(() => render(<DragState />)).toThrow("useDrag must be used inside DragProvider");
    expect(() => render(<TabState />)).toThrow("useTabs must be used within a TabProvider");
    expect(() => render(<StatusState />)).toThrow("useStatusBar must be used within StatusBarProvider");
  });

  it("keeps provider commands and state available to their consumers", () => {
    render(
      <>
        <MetadataExplorerProvider connectionName="Main" tables={[]}><MetadataState /></MetadataExplorerProvider>
        <DragProvider root={root}><DragState /></DragProvider>
        <TabProvider><TabState /></TabProvider>
        <StatusBarProvider><StatusState /></StatusBarProvider>
      </>,
    );

    expect(screen.getByRole("status", { name: "metadata state" })).toHaveTextContent("Main:0");
    fireEvent.click(screen.getByRole("button", { name: "Begin drag" }));
    expect(screen.getByRole("status", { name: "drag id" })).toHaveTextContent("root");
    fireEvent.click(screen.getByRole("button", { name: "End drag" }));
    expect(screen.getByRole("status", { name: "drag id" })).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "Open welcome" }));
    expect(screen.getByRole("status", { name: "tab state" })).toHaveTextContent("welcome:1");
    fireEvent.click(screen.getByRole("button", { name: "Set status" }));
    expect(screen.getByRole("status", { name: "status state" })).toHaveTextContent("sync");
  });

  it("dismisses one of two simultaneous toasts without removing the other", () => {
    render(<ToastProvider><ToastControls /></ToastProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Show first" }));
    fireEvent.click(screen.getByRole("button", { name: "Show second" }));
    expect(screen.getByText("First toast")).toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "✕" })[0]);
    expect(screen.queryByText("First toast")).not.toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();
  });
});
