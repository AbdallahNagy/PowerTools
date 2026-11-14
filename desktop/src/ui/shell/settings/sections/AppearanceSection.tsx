import { Check } from "lucide-react";

import type { ThemePreference } from "../../../platform/desktopBridge";
import { Alert, cn } from "../../../shared/ui";
import type { AppSettingsState } from "../useAppSettings";

const THEMES: Array<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "system", label: "System", hint: "Follow the Windows setting." },
  { value: "dark", label: "Dark", hint: "Always dark." },
  { value: "light", label: "Light", hint: "Always light." },
];

/**
 * A small drawing of the app window in one theme. `data-theme` scopes the
 * color tokens to it, so it shows that theme whatever the app is using.
 */
function WindowSketch({ scheme, className }: { scheme: "dark" | "light"; className?: string }) {
  return (
    <span data-theme={scheme} className={cn("absolute inset-0 flex flex-col bg-canvas", className)}>
      <span className="flex h-3 shrink-0 items-center gap-1 border-b border-line bg-surface px-1.5">
        <span className="h-1 w-1 rounded-full bg-accent-text" />
        <span className="h-0.5 w-6 rounded-full bg-fg-muted/50" />
      </span>
      <span className="flex min-h-0 flex-1">
        <span className="flex w-[26%] flex-col gap-1 border-r border-line bg-surface p-1.5">
          <span className="h-1 w-full rounded-full bg-raised" />
          <span className="h-0.5 w-4/5 rounded-full bg-fg-muted/60" />
          <span className="h-0.5 w-3/5 rounded-full bg-fg-muted/60" />
          <span className="h-0.5 w-4/5 rounded-full bg-fg-muted/60" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex h-2.5 shrink-0 bg-surface">
            <span className="w-2/5 border-t border-accent-text bg-canvas" />
          </span>
          <span className="flex flex-1 flex-col gap-1 p-1.5">
            <span className="h-0.5 w-3/5 rounded-full bg-fg-strong/70" />
            <span className="h-0.5 w-4/5 rounded-full bg-fg-muted/60" />
            <span className="h-0.5 w-2/3 rounded-full bg-fg-muted/60" />
            <span className="mt-auto h-1.5 w-1/4 self-end rounded-sm bg-accent" />
          </span>
        </span>
      </span>
    </span>
  );
}

export function AppearanceSection({ app }: { app: AppSettingsState }) {
  const current = app.settings?.theme;
  const disabled = app.busy || app.settings === null;
  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-fg-strong">Theme</legend>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const checked = current === theme.value;
            return (
              <label
                key={theme.value}
                className={cn(
                  "flex flex-col gap-2.5 rounded-md border bg-surface p-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus",
                  checked ? "border-accent-text" : "border-line",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                  !checked && !disabled && "hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="settings-theme"
                  value={theme.value}
                  className="sr-only"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => void app.setTheme(theme.value)}
                />
                <span aria-hidden="true" className="relative block aspect-[16/10] overflow-hidden rounded-sm border border-line">
                  <WindowSketch scheme={theme.value === "light" ? "light" : "dark"} />
                  {/* System shows both: the light half is cut along a diagonal. */}
                  {theme.value === "system" ? (
                    <WindowSketch scheme="light" className="[clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]" />
                  ) : null}
                </span>
                <span className="flex items-start justify-between gap-2 px-1 pb-0.5">
                  <span className="flex flex-col">
                    <span className="text-sm text-fg-strong">{theme.label}</span>
                    <span className="text-xs text-fg-muted">{theme.hint}</span>
                  </span>
                  {checked ? <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" /> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}
