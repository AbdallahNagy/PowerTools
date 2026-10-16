import React, { useEffect, useState } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import type { ConnectionSummary } from "../../shared/connections";
import { Alert, Button } from "../../shared/ui";
import { ConnectionDescriptionFields } from "./ConnectionDescriptionFields";
import {
  useInstalledBrowsers,
  validateDraft,
  type DescriptionDraft,
} from "./connectionDraft";

/** Second step of adding a connection: say which organization and environment it is. */
const ConnectionDetailsWindow = () => {
  const [envUrl, setEnvUrl] = useState("");
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [draft, setDraft] = useState<DescriptionDraft>({ organization: "", environment: "", browser: null });
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browsers = useInstalledBrowsers();

  useEffect(() => {
    desktopBridge.getPendingConnection().then((pending) => setEnvUrl(pending?.envUrl ?? ""));
    desktopBridge.listConnections().then(setConnections);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTriedSave(true);
    if (Object.keys(validateDraft(draft, connections)).length > 0) return;

    setSaving(true);
    setError(null);
    const result = await desktopBridge.saveConnectionDetails({
      organization: draft.organization.trim(),
      environment: draft.environment.trim(),
      browser: draft.browser,
    });
    // On success, the main process closes this window.
    if (!result.success) {
      setSaving(false);
      setError(result.error ?? "The connection could not be saved.");
    }
  };

  return (
    <div className="box-border flex h-screen w-screen flex-col gap-4 overflow-y-auto bg-canvas px-6 py-5 text-fg">
      <div>
        <h3 className="mb-1 font-bold text-fg-strong">Describe this connection</h3>
        <p className="truncate text-xs text-fg-muted" title={envUrl}>{envUrl}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <ConnectionDescriptionFields
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setError(null);
          }}
          connections={connections}
          browsers={browsers}
          envUrl={envUrl}
          showRequired={triedSave}
          autoFocus
        />

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
};

export default ConnectionDetailsWindow;
