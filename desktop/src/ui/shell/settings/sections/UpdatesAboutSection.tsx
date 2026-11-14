import { useState } from "react";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";

import PowerToolsIcon from "../../../assets/icons/power-tools-icon.svg";
import { desktopBridge, type UpdateStatus } from "../../../platform/desktopBridge";
import { Alert, Button, ProgressBar, Spinner } from "../../../shared/ui";
import { bridgeErrorMessage } from "../../community-tools/bridgeErrorMessage";
import { useUpdate } from "../../layout/updateContext";
import { RELEASES_URL, formatAppVersion } from "../../layout/updateStatus";
import type { AppSettingsState } from "../useAppSettings";
import { SettingRow, SettingsGroup } from "./SettingRow";

function describe(status: UpdateStatus): string {
  switch (status.state) {
    case "idle":
      return "Power Tools is up to date.";
    case "checking":
      return "Checking for updates…";
    case "available":
      return status.version ? `Version ${status.version} is available.` : "An update is available.";
    case "downloading":
      return "Downloading the update…";
    case "downloaded":
      return status.version ? `Version ${status.version} is ready to install.` : "The update is ready to install.";
    case "error":
      return `The last update check failed: ${status.message}`;
  }
}

export function UpdatesAboutSection({ app }: { app: AppSettingsState }) {
  const update = useUpdate();
  const status = update?.status;
  const version = formatAppVersion(app.settings?.version ?? "");
  const updatesEnabled = app.settings?.updatesEnabled !== false;
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // A check that finds nothing goes checking -> idle in an instant, so wait for it and say when it ran.
  const check = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      await desktopBridge.checkForUpdates();
      setCheckedAt(new Date());
    } catch (failure) {
      setCheckError(bridgeErrorMessage(failure));
    } finally {
      setChecking(false);
    }
  };

  const idleText =
    checkedAt && status?.state === "idle"
      ? `You have the latest version. Checked at ${checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
      : null;
  const busyChecking = checking || status?.state === "checking";

  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <section
        aria-label="About"
        className="flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-4"
      >
        <img src={PowerToolsIcon} alt="" className="h-10 w-10 shrink-0" />
        <p className="min-w-0 flex-1 text-base font-semibold text-fg-strong">Power Tools {version}</p>
        <Button variant="ghost" size="sm" onClick={() => void desktopBridge.openExternalUrl(RELEASES_URL)}>
          <ExternalLink size={14} aria-hidden="true" />
          Release notes
        </Button>
      </section>

      <SettingsGroup
        title="Updates"
        description={
          updatesEnabled ? "Power Tools checks for updates when it starts and asks before downloading." : undefined
        }
      >
        {!updatesEnabled ? (
          <p className="px-4 py-3 text-sm text-fg-muted">
            This is a development build, so it does not check for updates. Installed builds check when they start.
          </p>
        ) : update && status ? (
          <>
            <SettingRow
              label={
                <span role="status">
                  {busyChecking ? "Checking for updates…" : (idleText ?? describe(status))}
                </span>
              }
            >
              {status.state === "idle" || status.state === "error" || status.state === "checking" ? (
                <Button variant="secondary" size="sm" disabled={busyChecking} onClick={() => void check()}>
                  {busyChecking ? <Spinner size={14} /> : <RefreshCw size={14} aria-hidden="true" />}
                  Check for updates
                </Button>
              ) : null}
              {status.state === "available" ? (
                <Button size="sm" onClick={update.download}>
                  Download update
                </Button>
              ) : null}
              {status.state === "downloaded" ? (
                <Button size="sm" onClick={update.install}>
                  Restart to install
                </Button>
              ) : null}
            </SettingRow>
            {status.state === "downloading" ? (
              <div className="px-4 py-3">
                <ProgressBar value={status.percent ?? 0} max={100} label="Downloading the update" />
              </div>
            ) : null}
            {checkError ? (
              <div className="px-4 py-3">
                <Alert tone="danger">{checkError}</Alert>
              </div>
            ) : null}
          </>
        ) : (
          <p className="px-4 py-3 text-sm text-fg-muted">Updates are not available here.</p>
        )}
      </SettingsGroup>

      <SettingsGroup title="Folders">
        <SettingRow label="Data folder" description="Where Power Tools keeps its files on this computer.">
          <Button variant="secondary" size="sm" onClick={() => void app.openFolder("data")}>
            <FolderOpen size={14} aria-hidden="true" />
            Open data folder
          </Button>
        </SettingRow>
        <SettingRow label="Agent activity log" description="What agents did through the MCP server.">
          <Button variant="secondary" size="sm" onClick={() => void app.openFolder("mcp-activity")}>
            <FolderOpen size={14} aria-hidden="true" />
            Open agent activity log
          </Button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
