import { useContext, useState } from "react";

import { desktopBridge } from "../../../platform/desktopBridge";
import type { ConnectionInfo } from "../../../shared/connections";
import { ConnectionsContext } from "../../../shared/connections/ConnectionsContext";
import { Alert, EmptyState, Switch } from "../../../shared/ui";
import { bridgeErrorMessage } from "../../community-tools/bridgeErrorMessage";
import { ProductionBadge } from "../../connections/ConnectionGroupList";
import { SettingRow, SettingsGroup } from "./SettingRow";

/** Each connection's "agents may make non-destructive changes without asking" switch, in one place. */
export function AgentPermissionsSection() {
  const context = useContext(ConnectionsContext);
  const connections: ConnectionInfo[] = context?.connections ?? [];
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (connection: ConnectionInfo, allow: boolean) => {
    setSaving(connection.id);
    try {
      const result = await desktopBridge.updateConnection(connection.id, { agentChangesWithoutAsking: allow });
      setError(result.success ? null : (result.error ?? "Could not save the change."));
    } catch (failure) {
      setError(bridgeErrorMessage(failure));
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <SettingsGroup
        title="Changes without asking"
        description="By default every change an agent wants to make waits for your approval. Switch a connection on to let agents make non-destructive changes there without asking. Destructive actions such as deletes always ask."
      >
        {connections.length === 0 ? (
          <EmptyState title="No connections yet" description="Add a connection to choose what agents may do there." />
        ) : (
          connections.map((connection) => (
            <SettingRow
              key={connection.id}
              label={
                <span className="flex items-center gap-2">
                  <span className="truncate">{connection.displayName}</span>
                  <ProductionBadge connection={connection} />
                </span>
              }
              description={
                <span className="block truncate font-mono" title={connection.envUrl}>
                  {connection.envUrl}
                </span>
              }
            >
              <Switch
                checked={connection.agentChangesWithoutAsking === true}
                disabled={saving !== null}
                onChange={(next) => void change(connection, next)}
                aria-label={`Let agents make changes without asking on ${connection.displayName}`}
              />
            </SettingRow>
          ))
        )}
      </SettingsGroup>
    </>
  );
}
