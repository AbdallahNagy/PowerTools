export type ColorScheme = "dark" | "light";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/**
 * Keeps <html data-theme> in step with the OS or the View > Theme choice.
 * The main process sets nativeTheme.themeSource, which Electron reflects in
 * prefers-color-scheme, so the renderer only has to follow the media query.
 * Returns a function that stops following.
 */
export function followColorScheme(
  root: HTMLElement = document.documentElement,
  matchMedia: ((query: string) => MediaQueryList) | undefined = window.matchMedia?.bind(window),
): () => void {
  if (!matchMedia) {
    root.dataset.theme = "dark";
    return () => {};
  }

  const query = matchMedia(LIGHT_QUERY);
  const apply = () => {
    root.dataset.theme = query.matches ? "light" : "dark";
  };
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
