import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PUBLIC_TOOLS } from "../src/ui/tools/publicCatalog";
import { ACTIVITY_BAR_TOOLS } from "../src/ui/tools/registry";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("public tool catalog", () => {
  it("matches activity-bar tools in registry order", () => {
    expect(PUBLIC_TOOLS.map((tool) => tool.id)).toEqual(
      ACTIVITY_BAR_TOOLS.map((tool) => tool.id),
    );
    expect(PUBLIC_TOOLS.map((tool) => tool.title)).toEqual(
      ACTIVITY_BAR_TOOLS.map((tool) => tool.title),
    );

    for (const tool of PUBLIC_TOOLS) {
      expect(tool.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("is what the welcome page and website render", () => {
    const welcome = readFileSync(
      resolve(repoRoot, "desktop/src/ui/tools/welcome/index.tsx"),
      "utf8",
    );
    const website = readFileSync(
      resolve(repoRoot, "website/src/pages/index.astro"),
      "utf8",
    );

    expect(welcome).toContain("PUBLIC_TOOLS");
    expect(website).toContain("PUBLIC_TOOLS");

    for (const tool of PUBLIC_TOOLS) {
      expect(welcome).not.toContain(`title: "${tool.title}"`);
      expect(website).not.toContain(tool.title);
    }
  });
});
