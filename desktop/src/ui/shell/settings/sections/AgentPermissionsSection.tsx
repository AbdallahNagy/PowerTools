import { useContext, useState } from "react";

import { desktopBridge } from "../../../platform/desktopBridge";
import type { ConnectionInfo } from "../../../shared/connections";
import { ConnectionsContext } from "../../../shared/connections/ConnectionsContext";
import { Alert, EmptyState, Switch } from "../../../shared/ui";
import { bridgeErrorMessage } from "../../community-tools/bridgeErrorMessage";

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
      <p className="text-xs text-fg-muted">
        By default every change an agent wants to make waits for your approval. Allow it per connection to let agents make
        non-destructive changes without asking. Destructive actions such as deletes always ask.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {connections.length === 0 ? (
        <EmptyState title="No connections yet" description="Add a connection to choose what agents may do there." />
      ) : (
        <table className="w-full border border-line text-sm">
          <thead>
            <tr className="border-b border-line bg-raised text-left text-xs text-fg-muted">
              <th className="px-3 py-1.5 font-medium">Connection</th>
              <th className="px-3 py-1.5 font-medium">Environment</th>
              <th className="px-3 py-1.5 font-medium">Changes without asking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {connections.map((connection) => (
              <tr key={connection.id}>
                <td className="px-3 py-1.5 text-fg-strong">{connection.displayName}</td>
                <td className="max-w-xs truncate px-3 py-1.5 text-xs text-fg-muted" title={connection.envUrl}>
                  {connection.envUrl}
                </td>
                <td className="px-3 py-1.5">
                  <Switch
                    checked={connection.agentChangesWithoutAsking === true}
                    disabled={saving !== null}
                    onChange={(next) => void change(connection, next)}
                    aria-label={`Let agents make changes without asking on ${connection.displayName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
