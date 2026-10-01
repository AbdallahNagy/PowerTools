import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TabBar from "../../src/ui/components/layout/TabBar";
import { TabProvider } from "../../src/ui/context/TabContext";
import { useTabs } from "../../src/ui/context/useTabs";

function CloseAllTabs() {
  const { closeTab, tabs } = useTabs();

  return (
    <button type="button" onClick={() => tabs.forEach((tab) => closeTab(tab.id))}>
      Close all tabs
    </button>
  );
}

describe("empty workspace", () => {
  it("prompts to open a tool when every tab is closed", () => {
    render(
      <TabProvider>
        <CloseAllTabs />
        <TabBar />
      </TabProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Power Tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PowerTools" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close all tabs" }));

    expect(screen.queryByRole("heading", { name: "Power Tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Select a tool from the sidebar.")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+P to search tools")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+B to show or hide the sidebar")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PowerTools" })).not.toBeInTheDocument();
  });
});
