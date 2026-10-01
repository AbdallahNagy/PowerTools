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

    expect(screen.getByRole("heading", { name: "Power Tools" })).toBeInTheDocument();
    expect(screen.getByText("Open a tool")).toBeInTheDocument();
    expect(
      screen.getByText("Select one from the sidebar, or press Ctrl+P."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PowerTools" })).not.toBeInTheDocument();
  });
});
