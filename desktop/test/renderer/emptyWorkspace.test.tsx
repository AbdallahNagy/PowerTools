import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TabBar from "../../src/ui/shell/tabs/TabBar";
import { TabProvider } from "../../src/ui/shell/tabs/TabContext";
import { useTabs } from "../../src/ui/shell/tabs/useTabs";

const WELCOME_HEADING = "The last tool you need for Dataverse.";

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

    expect(screen.getByRole("heading", { name: WELCOME_HEADING })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close all tabs" }));

    expect(screen.queryByRole("heading", { name: WELCOME_HEADING })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("to search tools").nextElementSibling).toHaveTextContent("Ctrl+P");
    expect(screen.getByText("to perform main tool action").nextElementSibling).toHaveTextContent(
      "Ctrl+Enter",
    );
    expect(screen.getByText("to show or hide the sidebar").nextElementSibling).toHaveTextContent(
      "Ctrl+B",
    );
    expect(screen.queryByRole("heading", { name: WELCOME_HEADING })).not.toBeInTheDocument();
  });
});
