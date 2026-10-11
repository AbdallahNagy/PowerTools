import { useId, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Alert, Badge, Checkbox, DataTable, EmptyState, Field, Select, Toolbar } from "../../../shared/ui";
import { diffProperties, diffValue, parseComponentJson, type PropertyDiff } from "../model/componentJson";
import type { Layer } from "../model/types";
import {
  layerOptionLabel,
  nextSort,
  sortProperties,
  STATUS_LABELS,
  type PropertySortKey,
  type SortState,
} from "../model/view";
import { LayerDiff } from "./LayerDiff";

interface LayerCompareProps {
  componentType: number;
  layers: Layer[];
  leftId: string;
  rightId: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
  onlyDifferences: boolean;
  onOnlyDifferencesChange: (value: boolean) => void;
  property: string | null;
  onPropertyChange: (key: string | null) => void;
}

const statusTone = { different: "warn", onlyLeft: "neutral", onlyRight: "neutral" } as const;

export function LayerCompare({
  componentType,
  layers,
  leftId,
  rightId,
  onLeftChange,
  onRightChange,
  onlyDifferences,
  onOnlyDifferencesChange,
  property,
  onPropertyChange,
}: LayerCompareProps) {
  const onlyDifferencesId = useId();
  const [sort, setSort] = useState<SortState<PropertySortKey>>({ key: "key", direction: "asc" });
  const left = layers.find((layer) => layer.id === leftId) ?? layers[0]!;
  const right = layers.find((layer) => layer.id === rightId) ?? layers[0]!;
  const leftParsed = useMemo(() => parseComponentJson(left.componentJson), [left.componentJson]);
  const rightParsed = useMemo(() => parseComponentJson(right.componentJson), [right.componentJson]);
  const diffs = useMemo(
    () => diffProperties(leftParsed.properties, rightParsed.properties),
    [leftParsed, rightParsed],
  );
  const visible = sortProperties(
    onlyDifferences ? diffs.filter((row) => row.status !== "equal") : diffs,
    sort,
  );

  const keepProperty = (nextLeft: Layer, nextRight: Layer) => {
    if (!property) return;
    const inLeft = property in parseComponentJson(nextLeft.componentJson).properties;
    const inRight = property in parseComponentJson(nextRight.componentJson).properties;
    if (!inLeft || !inRight) onPropertyChange(null);
  };

  const changeLeft = (id: string) => {
    onLeftChange(id);
    keepProperty(layers.find((layer) => layer.id === id) ?? left, right);
  };
  const changeRight = (id: string) => {
    onRightChange(id);
    keepProperty(left, layers.find((layer) => layer.id === id) ?? right);
  };

  const columns = [
    {
      key: "key",
      header: "Property",
      sortable: true,
      render: (row: PropertyDiff) => <span className="font-mono text-xs">{row.key}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row: PropertyDiff) =>
        row.status === "equal" ? null : <Badge tone={statusTone[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
    },
  ];

  const single = layers.length <= 1;
  const chosen = property !== null && diffs.some((row) => row.key === property) ? property : null;
  const leftValue = chosen ? diffValue(componentType, chosen, leftParsed.properties[chosen]) : null;
  const rightValue = chosen ? diffValue(componentType, chosen, rightParsed.properties[chosen]) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        aria-label="Compare layers"
        end={
          <label htmlFor={onlyDifferencesId} className="flex items-center gap-2 text-sm text-fg">
            <Checkbox
              id={onlyDifferencesId}
              checked={onlyDifferences}
              onChange={onOnlyDifferencesChange}
              disabled={single}
            />
            Only differences
          </label>
        }
      >
        <Field label="Left layer" className="min-w-0 flex-1">
          <Select value={left.id} disabled={single} onChange={(event) => changeLeft(event.target.value)}>
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layerOptionLabel(layer)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Right layer" className="min-w-0 flex-1">
          <Select value={right.id} disabled={single} onChange={(event) => changeRight(event.target.value)}>
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layerOptionLabel(layer)}
              </option>
            ))}
          </Select>
        </Field>
      </Toolbar>
      {single ? (
        <EmptyState title="This component has only one layer. There is nothing to compare." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          {left.id === right.id ? <Alert tone="info">Both sides show the same layer.</Alert> : null}
          {!leftParsed.ok || !rightParsed.ok ? (
            <Alert tone="warn">One layer's properties could not be read as JSON.</Alert>
          ) : null}
          <Group orientation="horizontal" className="min-h-0 flex-1">
            <Panel id="sle-compare-properties" defaultSize="35%" minSize="20%" className="flex min-h-0 flex-col">
              <DataTable
                columns={columns}
                rows={visible}
                getRowKey={(row) => row.key}
                selectedKey={chosen}
                onRowClick={(row) => onPropertyChange(row.key)}
                sortKey={sort.key}
                sortDirection={sort.direction}
                onSort={(key) => setSort((current) => nextSort(current, key as PropertySortKey))}
                emptyMessage={onlyDifferences ? "No differences between these layers." : "No properties."}
                className="min-h-0"
              />
            </Panel>
            <Separator
              aria-label="Resize compare panes"
              className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
            />
            <Panel id="sle-compare-diff" minSize="35%" className="flex min-h-0 flex-col gap-1 pl-2">
              {chosen && leftValue && rightValue ? (
                <>
                  {leftValue.decoded || rightValue.decoded ? (
                    <p className="text-xs text-fg-muted">Decoded from base64.</p>
                  ) : null}
                  <div className="min-h-0 flex-1">
                    <LayerDiff
                      left={leftValue.text}
                      right={rightValue.text}
                      leftLabel={`${chosen}: ${layerOptionLabel(left)}`}
                      rightLabel={`${chosen}: ${layerOptionLabel(right)}`}
                    />
                  </div>
                </>
              ) : (
                <EmptyState title="Select a property to see its values side by side." />
              )}
            </Panel>
          </Group>
        </div>
      )}
    </div>
  );
}
