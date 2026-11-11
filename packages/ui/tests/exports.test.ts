import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const kitIndex = resolve(root, "../../desktop/src/ui/shared/ui/index.ts");

/** Names exported by `export { A, B as C, type D } from` and `export type { E } from` statements. */
function exportedNames(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const names: string[] = [];
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
    for (const part of match[1].split(",")) {
      const item = part.trim();
      if (!item) continue;
      const withoutType = item.replace(/^type\s+/, "");
      const alias = withoutType.split(/\s+as\s+/);
      names.push((alias[1] ?? alias[0]).trim());
    }
  }
  return names;
}

describe("@powertools/ui exports", () => {
  it("exports every name of the desktop UI kit across the two entries", () => {
    const kit = exportedNames(kitIndex);
    const packaged = [
      ...exportedNames(resolve(root, "src/index.ts")),
      ...exportedNames(resolve(root, "src/code-editor.ts")),
    ];
    expect(kit.length).toBeGreaterThan(20);
    expect([...packaged].sort()).toEqual([...kit].sort());
  });

  it("keeps the code editor out of the main entry", () => {
    const main = exportedNames(resolve(root, "src/index.ts"));
    const editor = exportedNames(resolve(root, "src/code-editor.ts"));
    expect(editor.sort()).toEqual(["CodeEditor", "CodeEditorProps", "preloadCodeEditor"]);
    expect(main).not.toContain("CodeEditor");
    expect(main).not.toContain("CodeEditorProps");
    expect(main).not.toContain("preloadCodeEditor");
  });
});
