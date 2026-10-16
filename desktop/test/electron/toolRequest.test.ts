import { describe, expect, it } from "vitest";

import { toolRequestUrl } from "../../src/electron/toolRequest.ts";
import { buildToolRequestUrl } from "../../src/ui/shared/links/toolRequest.ts";

describe("toolRequestUrl", () => {
  it("matches the renderer's tool request link", () => {
    expect(toolRequestUrl("1.2.0")).toBe(buildToolRequestUrl({ source: "desktop 1.2.0" }));
  });
});
