import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { releaseTools } from "../../scripts/release-tools.mjs";
import { readToolTable, renderToolTable } from "../../scripts/sync-readme-tools.mjs";
import { PUBLIC_TOOLS, RELEASED_TOOLS } from "../src/ui/tools/publicCatalog";
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
    expect(website).toContain("RELEASED_TOOLS");

    for (const tool of PUBLIC_TOOLS) {
      expect(welcome).not.toContain(`title: "${tool.title}"`);
      expect(website).not.toContain(`<h3>${tool.title}</h3>`);
    }
  });

  it("is the tool table in the README", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

    expect(
      readToolTable(readme),
      "README.md tool table is out of date. Run: node scripts/sync-readme-tools.mjs",
    ).toBe(renderToolTable(RELEASED_TOOLS));
  });

  it("leaves unreleased tools off the website and the README", () => {
    expect(RELEASED_TOOLS).toEqual(PUBLIC_TOOLS.filter((tool) => !tool.unreleased));
  });

  it("releases every flagged tool in Prepare Release", () => {
    const catalog = readFileSync(
      resolve(repoRoot, "desktop/src/ui/tools/publicCatalog.ts"),
      "utf8",
    );
    const { source, released } = releaseTools(catalog);

    expect(released).toEqual(
      PUBLIC_TOOLS.filter((tool) => tool.unreleased).map((tool) => tool.id),
    );
    expect(source).not.toMatch(/unreleased: true/);
    expect(source).toContain("unreleased?: true;");
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
