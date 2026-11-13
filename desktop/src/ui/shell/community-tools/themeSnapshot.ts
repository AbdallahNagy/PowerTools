import type { ShortcutSpec, ThemeSnapshot } from "@powertools/sdk/protocol";

const TOKEN_PREFIX = "--color-";

/**
 * Shell shortcuts a community tool frame forwards to the host while it has focus.
 * Derived from `matchShellShortcut`; the primary action is deliberately not here.
 * Letters carry no `code` so the tool matches on the typed key, as the shell does.
 */
export const FORWARDED_SHORTCUTS: ShortcutSpec[] = [
  { key: "w", ctrl: true, shift: false },
  { key: "Tab", ctrl: true, shift: false },
  { key: "Tab", ctrl: true, shift: true },
  { key: "p", ctrl: true, shift: false },
  { key: "b", ctrl: true, shift: false },
];

function collectTokenNames(rules: CSSRuleList, names: Set<string>): void {
  for (const rule of Array.from(rules)) {
    const style = (rule as CSSStyleRule).style;
    if (style) {
      for (const name of Array.from(style)) {
        if (name.startsWith(TOKEN_PREFIX)) names.add(name);
      }
    }
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) collectTokenNames(nested, names);
  }
}

/** The theme name from `data-theme` and every `--color-*` custom property in effect on the root. */
export function readThemeSnapshot(root: HTMLElement = document.documentElement): ThemeSnapshot {
  const names = new Set<string>();
  for (const sheet of Array.from(root.ownerDocument.styleSheets)) {
    try {
      collectTokenNames(sheet.cssRules, names);
    } catch {
      // A sheet from another origin cannot be read; it carries no tokens of ours.
    }
  }
  for (const name of Array.from(root.style)) {
    if (name.startsWith(TOKEN_PREFIX)) names.add(name);
  }

  const computed = root.ownerDocument.defaultView?.getComputedStyle(root);
  const tokens: Record<string, string> = {};
  for (const name of names) {
    const value = (computed?.getPropertyValue(name) || root.style.getPropertyValue(name)).trim();
    if (value) tokens[name] = value;
  }

  return { name: root.dataset.theme === "light" ? "light" : "dark", tokens };
}
