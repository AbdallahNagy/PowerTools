import { Alert, Checkbox } from "../../../shared/ui";
import type { AppSettingsState } from "../useAppSettings";

export function PrivacySection({ app }: { app: AppSettingsState }) {
  const disabled = app.busy || app.settings === null;
  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <label className="flex items-start gap-2 text-sm text-fg-strong">
        <Checkbox
          checked={app.settings?.usageStats ?? false}
          disabled={disabled}
          onChange={(next) => void app.setUsageStats(next)}
          aria-label="Send anonymous usage stats"
        />
        <span className="flex flex-col">
          Send anonymous usage stats
          <span className="text-xs text-fg-muted">One daily heartbeat with a random install ID, the app version, and the OS. No user names, connections, or Dataverse data.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-fg-strong">
        <Checkbox
          checked={app.settings?.crashReports ?? false}
          disabled={disabled}
          onChange={(next) => void app.setCrashReports(next)}
          aria-label="Send crash reports"
        />
        <span className="flex flex-col">
          Send crash reports
          <span className="text-xs text-fg-muted">Error details that help fix crashes. Applies right away.</span>
        </span>
      </label>
    </>
  );
}
