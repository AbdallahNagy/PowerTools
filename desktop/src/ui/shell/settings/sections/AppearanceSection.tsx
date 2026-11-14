import type { ThemePreference } from "../../../platform/desktopBridge";
import { Alert } from "../../../shared/ui";
import type { AppSettingsState } from "../useAppSettings";

const THEMES: Array<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "system", label: "System", hint: "Follow the Windows setting." },
  { value: "dark", label: "Dark", hint: "Always dark." },
  { value: "light", label: "Light", hint: "Always light." },
];

export function AppearanceSection({ app }: { app: AppSettingsState }) {
  const current = app.settings?.theme;
  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg-strong">Theme</legend>
        {THEMES.map((theme) => (
          <label key={theme.value} className="flex items-start gap-2 text-sm text-fg-strong">
            <input
              type="radio"
              name="settings-theme"
              value={theme.value}
              className="mt-0.5 accent-accent"
              checked={current === theme.value}
              disabled={app.busy || app.settings === null}
              onChange={() => void app.setTheme(theme.value)}
            />
            <span className="flex flex-col">
              {theme.label}
              <span className="text-xs text-fg-muted">{theme.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
