import { describe, expect, it } from "vitest";

import { BUILT_IN_TOOL_IDS } from "../../src/electron/communityTools/builtInToolIds";
import { BUILT_IN_TOOLS } from "../../src/ui/tools/registry";

describe("BUILT_IN_TOOL_IDS", () => {
  it("matches the ids of the renderer's built-in tools", () => {
    expect(BUILT_IN_TOOL_IDS).toEqual(BUILT_IN_TOOLS.map((tool) => tool.id));
  });
});
