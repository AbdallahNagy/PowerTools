import { BrowserWindow, nativeTheme } from "electron";
import { readSettings, writeSettings } from "./settings.js";

export const THEME_PREFERENCES = ["system", "dark", "light", "claude"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The palette a window draws with. Claude is a second dark palette. */
export type ColorScheme = "dark" | "light" | "claude";

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
  claude: "Claude Dark",
};

/** Renderer windows read their first theme from this argument, so they paint it without a flash. */
export const THEME_ARGUMENT_PREFIX = "--power-tools-theme=";

/** Sent to every window when the preference changes. */
export const THEME_CHANGED_CHANNEL = "theme-preference-changed";

/**
 * Window backgrounds, painted before the renderer loads so there is no flash.
 * Keep in sync with --color-surface and --color-canvas in src/ui/styles/theme.css.
 */
export const WINDOW_BACKGROUNDS = {
  surface: { dark: "#1b1f26", light: "#ffffff", claude: "#262624" },
  canvas: { dark: "#14171c", light: "#f6f7f9", claude: "#1f1e1d" },
} as const;

export type WindowBackground = keyof typeof WINDOW_BACKGROUNDS;

let currentPreference: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function loadThemePreference(): ThemePreference {
  const { theme } = readSettings();
  return isThemePreference(theme) ? theme : "system";
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    writeSettings({ theme });
  } catch (err) {
    console.error("Failed to persist theme preference:", err);
  }
}

/** Claude Dark is a dark theme, so native controls and prefers-color-scheme are dark. */
function nativeThemeSource(theme: ThemePreference): "system" | "dark" | "light" {
  return theme === "claude" ? "dark" : theme;
}

export function currentColorScheme(): ColorScheme {
  if (currentPreference === "claude") return "claude";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function windowBackgroundColor(background: WindowBackground = "surface"): string {
  return WINDOW_BACKGROUNDS[background][currentColorScheme()];
}

/** The argument to add to a renderer window's webPreferences.additionalArguments. */
export function themeArgument(): string {
  return `${THEME_ARGUMENT_PREFIX}${currentPreference}`;
}

function repaintWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(windowBackgroundColor());
    }
  }
}

/**
 * Applies a theme preference. Setting nativeTheme.themeSource also drives
 * prefers-color-scheme in every renderer. Switching between Dark and Claude
 * Dark leaves that unchanged, so every window is also told the preference.
 */
export function applyThemePreference(theme: ThemePreference): void {
  const changed = theme !== currentPreference;
  currentPreference = theme;
  nativeTheme.themeSource = nativeThemeSource(theme);
  if (!changed) return;
  repaintWindows();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(THEME_CHANGED_CHANNEL, theme);
    }
  }
}

/** Starts from the saved preference and keeps window backgrounds in step with it. */
export function initializeTheme(): ThemePreference {
  const theme = loadThemePreference();
  applyThemePreference(theme);
  nativeTheme.on("updated", repaintWindows);
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
