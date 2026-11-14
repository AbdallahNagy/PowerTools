import { Alert } from "../../../shared/ui";
import type { AppSettingsState } from "../useAppSettings";
import { SettingSwitchRow, SettingsGroup } from "./SettingRow";

export function PrivacySection({ app }: { app: AppSettingsState }) {
  const disabled = app.busy || app.settings === null;
  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <SettingsGroup title="Diagnostics">
        <SettingSwitchRow
          label="Send anonymous usage stats"
          description="One daily heartbeat with a random install ID, the app version, and the OS. No user names, connections, or Dataverse data."
          checked={app.settings?.usageStats ?? false}
          disabled={disabled}
          onChange={(next) => void app.setUsageStats(next)}
        />
        <SettingSwitchRow
          label="Send crash reports"
          description="Error details that help fix crashes. Applies right away."
          checked={app.settings?.crashReports ?? false}
          disabled={disabled}
          onChange={(next) => void app.setCrashReports(next)}
        />
      </SettingsGroup>
    </>
  );
}
