import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToastProvider, useToast } from "../../src/ui/shared/ui";
import { StatusBarProvider, useStatusBar } from "../../src/ui/shared/status";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";

function ToastControls() {
  const { showToast } = useToast();

  return (
    <>
      <button type="button" onClick={() => showToast("First toast", "success")}>Show first</button>
      <button type="button" onClick={() => showToast("Second toast", "error")}>Show second</button>
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
    expect(() => render(<TabState />)).toThrow("useTabs must be used within a TabProvider");
    expect(() => render(<StatusState />)).toThrow("useStatusBar must be used within StatusBarProvider");
  });

  it("keeps provider commands and state available to their consumers", () => {
    render(
      <>
        <TabProvider><TabState /></TabProvider>
        <StatusBarProvider><StatusState /></StatusBarProvider>
      </>,
    );

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
