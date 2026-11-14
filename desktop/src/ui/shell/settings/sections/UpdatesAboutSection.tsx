import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";

import { desktopBridge, type UpdateStatus } from "../../../platform/desktopBridge";
import { Alert, Button, ProgressBar } from "../../../shared/ui";
import { useUpdate } from "../../layout/updateContext";
import { RELEASES_URL, formatAppVersion } from "../../layout/updateStatus";
import type { AppSettingsState } from "../useAppSettings";

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

  return (
    <>
      {app.error ? <Alert tone="danger">{app.error}</Alert> : null}
      <section className="flex flex-col gap-1" aria-label="About">
        <h3 className="text-sm font-medium text-fg-strong">About</h3>
        <p className="text-sm text-fg">Power Tools {version}</p>
        <div>
          <Button variant="ghost" size="sm" onClick={() => void desktopBridge.openExternalUrl(RELEASES_URL)}>
            <ExternalLink size={14} aria-hidden="true" />
            Release notes
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Updates">
        <h3 className="text-sm font-medium text-fg-strong">Updates</h3>
        {update && status ? (
          <>
            <p className="text-sm text-fg">{describe(status)}</p>
            {status.state === "downloading" ? <ProgressBar value={status.percent ?? 0} max={100} label="Downloading the update" /> : null}
            <div className="flex flex-wrap gap-2">
              {status.state === "idle" || status.state === "error" ? (
                <Button variant="secondary" size="sm" onClick={update.retry}>
                  <RefreshCw size={14} aria-hidden="true" />
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
            </div>
          </>
        ) : (
          <p className="text-sm text-fg-muted">Updates are not available here.</p>
        )}
        <p className="text-xs text-fg-muted">Power Tools checks for updates when it starts and asks before downloading.</p>
      </section>

      <section className="flex flex-col gap-2" aria-label="Folders">
        <h3 className="text-sm font-medium text-fg-strong">Folders</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void app.openFolder("data")}>
            <FolderOpen size={14} aria-hidden="true" />
            Open data folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void app.openFolder("mcp-activity")}>
            <FolderOpen size={14} aria-hidden="true" />
            Open agent activity log
          </Button>
        </div>
      </section>
    </>
  );
}
