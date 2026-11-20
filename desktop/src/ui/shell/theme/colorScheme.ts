import type { ThemePreference } from "../../platform/desktopBridge";

export type ColorScheme = "dark" | "light" | "dark-orange";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** Where the renderer hears about the View > Theme choice. */
export interface ThemePreferenceSource {
  initial: ThemePreference;
  subscribe(callback: (theme: ThemePreference) => void): () => void;
}

/**
 * Keeps <html data-theme> in step with the OS or the View > Theme choice.
 * The main process sets nativeTheme.themeSource, which Electron reflects in
 * prefers-color-scheme, so System, Dark, and Light only follow the media
 * query. Dark Orange keeps prefers-color-scheme dark, so the preference
 * itself picks it. Returns a function that stops following.
 */
export function followColorScheme(
  root: HTMLElement = document.documentElement,
  matchMedia: ((query: string) => MediaQueryList) | undefined = window.matchMedia?.bind(window),
  preference?: ThemePreferenceSource,
): () => void {
  let theme: ThemePreference = preference?.initial ?? "system";
  const query = matchMedia?.(LIGHT_QUERY);

  const apply = () => {
    if (theme === "dark-orange") root.dataset.theme = "dark-orange";
    else root.dataset.theme = query?.matches ? "light" : "dark";
  };
  apply();

  query?.addEventListener("change", apply);
  const unsubscribe = preference?.subscribe((next) => {
    theme = next;
    apply();
  });
  return () => {
    query?.removeEventListener("change", apply);
    unsubscribe?.();
  };
}
