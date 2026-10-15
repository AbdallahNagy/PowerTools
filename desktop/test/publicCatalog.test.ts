import { existsSync, readFileSync } from "node:fs";
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
      expect(website).not.toContain(`<h3>${tool.title}</h3>`);
    }
  });

  it("has a website tool page for every tool", () => {
    for (const tool of PUBLIC_TOOLS) {
      const page = resolve(repoRoot, `website/src/content/tools/${tool.id}.md`);
      expect(existsSync(page), `missing ${page}`).toBe(true);

      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/^---\r?\n[\s\S]*?seoTitle:[\s\S]*?seoDescription:[\s\S]*?features:[\s\S]*?\r?\n---\r?\n/);
    }
  });
});
