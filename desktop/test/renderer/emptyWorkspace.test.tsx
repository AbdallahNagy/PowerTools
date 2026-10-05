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
  it("lists keyboard shortcuts when every tab is closed", () => {
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
    expect(screen.getByText("to search tools").nextElementSibling).toHaveTextContent("Ctrl+P");
    expect(screen.getByText("to perform main tool action").nextElementSibling).toHaveTextContent(
      "Ctrl+Enter",
    );
    expect(screen.getByText("to show or hide the sidebar").nextElementSibling).toHaveTextContent(
      "Ctrl+B",
    );
    expect(screen.queryByRole("heading", { name: "PowerTools" })).not.toBeInTheDocument();
  });
});
