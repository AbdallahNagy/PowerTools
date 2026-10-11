import { RotateCw } from "lucide-react";
import { Badge, Button, DataTable, Tooltip } from "../../../shared/ui";
import type { ComponentRow, Layer } from "../model/types";
import { formatOverwriteTime } from "../model/view";

interface LayerListProps {
  component: ComponentRow;
  typeLabel: string;
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (layer: Layer) => void;
  onReload: () => void;
  reloading: boolean;
  removeDisabledReason: string | null;
  onRemove: () => void;
}

const columns = [
  { key: "order", header: "Order", width: "4.5rem", render: (layer: Layer) => layer.order },
  {
    key: "solution",
    header: "Solution",
    render: (layer: Layer) => (
      <span className="inline-flex items-center gap-2">
        <span>{layer.solutionName}</span>
        {layer.isActive ? <Badge tone="accent">Active</Badge> : null}
      </span>
    ),
  },
  { key: "publisher", header: "Publisher", render: (layer: Layer) => layer.publisherName },
  {
    key: "version",
    header: "Version",
    render: (layer: Layer) => (layer.isActive ? "" : (layer.solutionVersion ?? "")),
  },
  { key: "overwrite", header: "Overwrite Time", render: (layer: Layer) => formatOverwriteTime(layer.overwriteTime) },
];

export function LayerListHeader({
  component,
  typeLabel,
  onReload,
  reloading,
  removeDisabledReason,
  onRemove,
}: Omit<LayerListProps, "layers" | "selectedLayerId" | "onSelectLayer">) {
  const removeButton = (
    <Button variant="danger" size="sm" disabled={removeDisabledReason !== null} onClick={onRemove}>
      Remove Active layer
    </Button>
  );

  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-3 py-2">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-fg-strong">{component.name || component.logicalName}</h2>
        <p className="truncate text-xs text-fg-muted">
          {typeLabel}
          {component.logicalName ? (
            <>
              {" · "}
              <span className="font-mono">{component.logicalName}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Reload layers" onClick={onReload} disabled={reloading}>
          <RotateCw size={14} aria-hidden="true" />
        </Button>
        {removeDisabledReason === null ? (
          removeButton
        ) : (
          <Tooltip content={removeDisabledReason}>
            <span tabIndex={0} aria-label={removeDisabledReason} className="inline-flex rounded-sm">
              {removeButton}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function LayerTable({
  layers,
  selectedLayerId,
  onSelectLayer,
}: Pick<LayerListProps, "layers" | "selectedLayerId" | "onSelectLayer">) {
  return (
    <DataTable
      columns={columns}
      rows={layers}
      getRowKey={(layer) => layer.id}
      selectedKey={selectedLayerId}
      onRowClick={onSelectLayer}
      emptyMessage="No solution layers were found for this component."
      className="min-h-0"
    />
  );
}
