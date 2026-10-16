import type { ReactNode } from "react";

import { Badge } from "../../shared/ui";
import { groupConnections, type ConnectionInfo } from "../../shared/connections";

export function ProductionBadge({ connection }: { connection: ConnectionInfo }) {
  return connection.environmentKind === "production" ? (
    <Badge tone="danger" className="shrink-0">PROD</Badge>
  ) : null;
}

interface ConnectionGroupListProps {
  connections: readonly ConnectionInfo[];
  /** Renders one connection row. Rows under an organization show only the environment. */
  renderRow: (connection: ConnectionInfo, label: string) => ReactNode;
  /** Extra content for the "Other" heading, such as a hint to update old connections. */
  ungroupedHint?: ReactNode;
}

/** Connections under organization headings, with connections not described yet under "Other". */
export function ConnectionGroupList({ connections, renderRow, ungroupedHint }: ConnectionGroupListProps) {
  return (
    <>
      {groupConnections(connections).map((group) => (
        <div key={group.organization ?? "__other"} role="group" aria-label={group.label}>
          <div className="flex items-center gap-2 px-3 pb-0.5 pt-1.5 text-xs text-fg-muted">
            <span className="truncate font-medium">{group.label}</span>
            {group.organization === null ? ungroupedHint : null}
          </div>
          {group.connections.map((connection) =>
            renderRow(connection, group.organization ? connection.environment ?? connection.displayName : connection.displayName),
          )}
        </div>
      ))}
    </>
  );
}
