import { describe, expect, it } from "vitest";

import { buildToolRequestUrl, TOOL_REQUEST_ISSUE_URL } from "./toolRequest";

describe("buildToolRequestUrl", () => {
  it("opens the tool request form with an empty title prefix", () => {
    const url = new URL(buildToolRequestUrl());

    expect(`${url.origin}${url.pathname}`).toBe(TOOL_REQUEST_ISSUE_URL);
    expect(url.searchParams.get("template")).toBe("tool-request.yml");
    expect(url.searchParams.get("title")).toBe("[Tool request]: ");
    expect(url.searchParams.has("tool-name")).toBe(false);
  });

  it("prefills the form fields by id and trims blanks", () => {
    const url = new URL(
      buildToolRequestUrl({
        name: "  Bulk updater ",
        problem: "Update many & fast",
        xrmToolBoxPlugin: " ",
        source: "desktop 1.2.0",
      }),
    );

    expect(url.searchParams.get("title")).toBe("[Tool request]: Bulk updater");
    expect(url.searchParams.get("tool-name")).toBe("Bulk updater");
    expect(url.searchParams.get("problem")).toBe("Update many & fast");
    expect(url.searchParams.has("xrmtoolbox-plugin")).toBe(false);
    expect(url.searchParams.get("source")).toBe("desktop 1.2.0");
  });
});
