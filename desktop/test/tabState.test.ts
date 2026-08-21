import { describe, expect, it } from "vitest";

import type { TabData } from "../src/ui/common/types/tab-data.interface";
import {
  activateTab,
  addTab,
  closeTab,
  createInitialTabState,
  openToolTab,
  type TabState,
} from "../src/ui/shell/tabs/tabState";
import { defineTool } from "../src/ui/tools/defineTool";

function TestTool() {
  return null;
}

const welcomeTool = defineTool({
  id: "welcome",
  title: "Welcome",
  icon: "",
  showInActivityBar: false,
  component: TestTool,
  allowMultipleInstances: false,
});

const builderTool = defineTool({
  id: "fetchxml-builder",
  title: "FetchXML Builder",
  icon: "builder.svg",
  showInActivityBar: true,
  component: TestTool,
  allowMultipleInstances: true,
});

const welcomeTab: TabData = {
  id: "welcome",
  toolId: "welcome",
  title: "Welcome",
};

const initialState: TabState = {
  tabs: [welcomeTab],
  activeTabId: "welcome",
};

describe("tab state", () => {
  it("derives the initial tab from its tool definition", () => {
    expect(createInitialTabState(welcomeTool)).toEqual(initialState);
  });

  it("opens and names multiple instances in order", () => {
    const first = openToolTab(initialState, builderTool, 101);
    const second = openToolTab(first, builderTool, 202);

    expect(second).toEqual({
      tabs: [
        welcomeTab,
        {
          id: "fetchxml-builder-101",
          toolId: "fetchxml-builder",
          title: "FetchXML Builder",
        },
        {
          id: "fetchxml-builder-202",
          toolId: "fetchxml-builder",
          title: "FetchXML Builder 2",
        },
      ],
      activeTabId: "fetchxml-builder-202",
    });
  });

  it("increments suffixes for repeated same-millisecond openings", () => {
    const first = openToolTab(initialState, builderTool, 303);
    const second = openToolTab(first, builderTool, 303);
    const third = openToolTab(second, builderTool, 303);

    expect(third.tabs.map((tab) => tab.id)).toEqual([
      "welcome",
      "fetchxml-builder-303",
      "fetchxml-builder-303-2",
      "fetchxml-builder-303-3",
    ]);
    expect(third.activeTabId).toBe("fetchxml-builder-303-3");
  });

  it("activates an existing singleton instead of adding another", () => {
    const withBuilder = openToolTab(initialState, builderTool, 404);

    const reopened = openToolTab(withBuilder, welcomeTool, 405);

    expect(reopened.tabs).toEqual(withBuilder.tabs);
    expect(reopened.activeTabId).toBe("welcome");
  });

  it("returns the same state when the active singleton reopens", () => {
    expect(openToolTab(initialState, welcomeTool, 406)).toBe(initialState);
  });

  it("adds a pre-built tab and activates it", () => {
    const tab: TabData = {
      id: "custom",
      toolId: "custom",
      title: "Custom",
      content: "Custom content",
    };

    expect(addTab(initialState, tab)).toEqual({
      tabs: [welcomeTab, tab],
      activeTabId: "custom",
    });
  });

  it("does not duplicate a pre-built tab with an existing ID", () => {
    const state = addTab(initialState, {
      id: "custom",
      toolId: "custom",
      title: "Custom",
    });

    const repeated = addTab(state, {
      id: "custom",
      toolId: "changed",
      title: "Changed",
    });

    expect(repeated.tabs).toEqual(state.tabs);
    expect(repeated.activeTabId).toBe("custom");
  });

  it("returns the same state when the active pre-built tab already exists", () => {
    expect(addTab(initialState, { ...welcomeTab, title: "Changed" })).toBe(
      initialState,
    );
  });

  it("activates a tab without changing the open tabs", () => {
    const state = openToolTab(initialState, builderTool, 505);

    expect(activateTab(state, "welcome")).toEqual({
      tabs: state.tabs,
      activeTabId: "welcome",
    });
  });

  it("returns the same state when the active tab is activated again", () => {
    expect(activateTab(initialState, "welcome")).toBe(initialState);
  });

  it("activates the tab on the left when the active tab closes", () => {
    const first = openToolTab(initialState, builderTool, 601);
    const second = openToolTab(first, builderTool, 602);

    expect(closeTab(second, "fetchxml-builder-602")).toEqual({
      tabs: [welcomeTab, first.tabs[1]],
      activeTabId: "fetchxml-builder-601",
    });
  });

  it("keeps the active tab when a background tab closes", () => {
    const first = openToolTab(initialState, builderTool, 701);
    const second = openToolTab(first, builderTool, 702);

    const closed = closeTab(second, "fetchxml-builder-701");

    expect(closed.tabs.map((tab) => tab.id)).toEqual([
      "welcome",
      "fetchxml-builder-702",
    ]);
    expect(closed.activeTabId).toBe("fetchxml-builder-702");
  });

  it("clears the active ID when the final tab closes", () => {
    expect(closeTab(initialState, "welcome")).toEqual({
      tabs: [],
      activeTabId: "",
    });
  });
});
