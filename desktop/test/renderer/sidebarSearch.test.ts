import { describe, expect, it } from "vitest";

import {
  filterSidebarItems,
  matchesSidebarSearch,
} from "../../src/ui/components/layout/sidebarSearch";

describe("sidebar search", () => {
  const tools = [
    { title: "Data Migration", tooltip: "data migration" },
    { title: "FetchXML Builder", tooltip: "Build, run, and refine FetchXML queries" },
  ];

  it("keeps every item when the query is blank", () => {
    expect(filterSidebarItems(tools, "   ")).toEqual(tools);
  });

  it("matches a tool title or tooltip", () => {
    expect(filterSidebarItems(tools, "fetch").map((tool) => tool.title)).toEqual([
      "FetchXML Builder",
    ]);
    expect(matchesSidebarSearch({ title: "Connect", tooltip: "connect" }, "CON")).toBe(true);
    expect(matchesSidebarSearch({ title: "Connect", tooltip: "connect" }, "xml")).toBe(false);
  });
});
