import { app, BrowserWindow, nativeTheme } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const THEME_PREFERENCES = ["system", "dark", "light"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

/**
 * Window backgrounds, painted before the renderer loads so there is no flash.
 * Keep in sync with --color-surface and --color-canvas in src/ui/styles/theme.css.
 */
export const WINDOW_BACKGROUNDS = {
  surface: { dark: "#1b1f26", light: "#ffffff" },
  canvas: { dark: "#14171c", light: "#f6f7f9" },
} as const;

export type WindowBackground = keyof typeof WINDOW_BACKGROUNDS;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

function settingsFilePath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function readSettings(): Record<string, unknown> {
  const path = settingsFilePath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadThemePreference(): ThemePreference {
  const { theme } = readSettings();
  return isThemePreference(theme) ? theme : "system";
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    writeFileSync(settingsFilePath(), JSON.stringify({ ...readSettings(), theme }, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist theme preference:", err);
  }
}

export function windowBackgroundColor(background: WindowBackground = "surface"): string {
  return WINDOW_BACKGROUNDS[background][nativeTheme.shouldUseDarkColors ? "dark" : "light"];
}

/**
 * Applies a theme preference. Setting nativeTheme.themeSource also drives
 * prefers-color-scheme in every renderer, which the UI follows.
 */
export function applyThemePreference(theme: ThemePreference): void {
  nativeTheme.themeSource = theme;
}

/** Starts from the saved preference and keeps window backgrounds in step with it. */
export function initializeTheme(): ThemePreference {
  const theme = loadThemePreference();
  applyThemePreference(theme);
  nativeTheme.on("updated", () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.setBackgroundColor(windowBackgroundColor());
      }
    }
  });
  return theme;
}

export function createThemeMenuItems(
  current: ThemePreference,
  onSelect: (theme: ThemePreference) => void,
): Electron.MenuItemConstructorOptions[] {
  return THEME_PREFERENCES.map((theme) => ({
    label: THEME_LABELS[theme],
    type: "radio",
    checked: theme === current,
    click: () => onSelect(theme),
  }));
}
