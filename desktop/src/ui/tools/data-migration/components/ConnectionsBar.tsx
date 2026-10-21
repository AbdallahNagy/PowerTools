import { Fragment } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { type ConnectionInfo } from "../../../shared/connections";
import { Button, Field, Menu, Select } from "../../../shared/ui";
import { TargetChip, type TargetItem } from "./TargetChip";

interface ConnectionsBarProps {
  connections: ConnectionInfo[];
  sourceName: string;
  onSourceChange: (name: string) => void;
  targets: TargetItem[];
  onAddTarget: (id: string) => void;
  onRemoveTarget: (id: string) => void;
  onMigrateTarget: (id: string) => void;
}

export function ConnectionsBar({
  connections,
  sourceName,
  onSourceChange,
  targets,
  onAddTarget,
  onRemoveTarget,
  onMigrateTarget,
}: ConnectionsBarProps) {
  const selected = new Set(targets.map((t) => t.id));
  const addable = connections.filter((c) => c.id !== sourceName && !selected.has(c.id));
  const done = targets.filter((t) => t.state === "succeeded" || t.state === "partial").length;

  return (
    <div className="flex items-end gap-3 min-w-0 flex-wrap">
      <Field label="Source">
        <Select
          value={sourceName}
          onChange={(e) => onSourceChange(e.target.value)}
          className="w-52 [&>select]:bg-raised"
        >
          <option value="">— select —</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id} disabled={selected.has(c.id)}>
              {c.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <span className="text-fg-muted pb-1.5">→</span>
      <div role="group" aria-label="Targets" className="flex flex-col gap-1 min-w-0">
        <span className="text-xs font-medium text-fg-muted">
          {targets.length > 1 ? `Targets · ${done} of ${targets.length} migrated` : "Target"}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap min-h-8">
          {targets.map((t, i) => (
            <Fragment key={t.id}>
              {i > 0 && (
                <ChevronRight size={14} className="text-fg-muted shrink-0" aria-hidden="true" />
              )}
              <TargetChip item={t} onMigrate={onMigrateTarget} onRemove={onRemoveTarget} />
            </Fragment>
          ))}
          <Menu
            trigger={
              <Button
                variant={targets.length === 0 ? "secondary" : "ghost"}
                size="sm"
                disabled={addable.length === 0}
                className="py-1.5"
              >
                <Plus size={14} aria-hidden="true" />
                {targets.length === 0 ? "Add target" : "Add"}
              </Button>
            }
            items={addable.map((c) => ({ label: c.displayName, onSelect: () => onAddTarget(c.id) }))}
          />
        </div>
      </div>
    </div>
  );
}
