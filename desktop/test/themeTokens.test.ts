import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../src/ui/styles/theme.css", import.meta.url)),
  "utf8",
);

function block(start: string): Record<string, string> {
  const from = css.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", from) + 1, css.indexOf("}", from));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

describe("theme tokens", () => {
  it("keeps the nested dark scope equal to the default dark values", () => {
    const defaults = block("@theme");
    const nestedDark = block('[data-theme="dark"]');
    const light = block('[data-theme="light"]');

    // The nested scope resets exactly what the light theme changes.
    expect(Object.keys(nestedDark).sort()).toEqual(Object.keys(light).sort());
    for (const [token, value] of Object.entries(nestedDark)) {
      expect(`${token}: ${value}`).toBe(`${token}: ${defaults[token]}`);
    }
  });
});
