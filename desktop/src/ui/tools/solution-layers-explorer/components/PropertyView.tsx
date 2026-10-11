import { useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Alert, CodeEditor, DataTable, EmptyState, SearchInput } from "../../../shared/ui";
import { parseComponentJson, prettyText } from "../model/componentJson";
import { displayValue, valueSummary } from "../model/propertyValue";
import { nextSort, type SortState } from "../model/view";

export type PropertyViewMode = "properties" | "json";

interface PropertyViewProps {
  componentType: number;
  raw: string | null;
  label: string;
  empty: string;
  mode: PropertyViewMode;
}

interface PropertyRow {
  key: string;
  summary: string;
}

const FORMAT_LABELS = { empty: "Empty", text: "Text", json: "JSON", xml: "XML" } as const;

function JsonView({ raw, label }: { raw: string | null; label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col pt-2">
      <CodeEditor value={prettyText(raw)} readOnly lineNumbers folding aria-label={label} className="flex-1" />
    </div>
  );
}

/**
 * One layer's properties as a table: short values in full, long ones summarized.
 * Selecting a row shows its whole value below, formatted (XML, JSON, decoded web resource content).
 * The JSON mode shows the raw data instead.
 */
export function PropertyView({ componentType, raw, label, empty, mode }: PropertyViewProps) {
  const parsed = useMemo(() => parseComponentJson(raw), [raw]);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState<"key">>({ key: "key", direction: "asc" });
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const sign = sort.direction === "asc" ? 1 : -1;
    return Object.entries(parsed.properties)
      .filter(([key]) => needle === "" || key.toLowerCase().includes(needle))
      .map(([key, value]): PropertyRow => ({ key, summary: valueSummary(componentType, key, value) }))
      .sort((left, right) => left.key.localeCompare(right.key, undefined, { sensitivity: "base" }) * sign);
  }, [parsed, filter, sort, componentType]);

  if ((raw ?? "").trim() === "") return <EmptyState title={empty} />;
  if (mode === "json") return <JsonView raw={raw} label={label} />;
  if (!parsed.ok) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
        <Alert tone="warn">These properties could not be read as a list, so they are shown as written.</Alert>
        <CodeEditor value={prettyText(raw)} readOnly lineNumbers folding aria-label={label} className="flex-1" />
      </div>
    );
  }

  const chosen = selected !== null && selected in parsed.properties ? selected : null;
  const shown = chosen === null ? null : displayValue(componentType, chosen, parsed.properties[chosen]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 pt-2">
      <SearchInput
        value={filter}
        onChange={setFilter}
        placeholder="Filter properties"
        aria-label={`Filter ${label.toLowerCase()}`}
      />
      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel id="sle-property-table" defaultSize="55%" minSize="20%" className="flex min-h-0 flex-col">
          <DataTable
            columns={[
              {
                key: "key",
                header: "Property",
                sortable: true,
                render: (row: PropertyRow) => <span className="font-mono text-xs">{row.key}</span>,
              },
              {
                key: "summary",
                header: "Value",
                render: (row: PropertyRow) => (
                  <span className="block truncate font-mono text-xs" title={row.summary}>
                    {row.summary}
                  </span>
                ),
              },
            ]}
            rows={rows}
            getRowKey={(row) => row.key}
            selectedKey={chosen}
            onRowClick={(row) => setSelected(row.key)}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={() => setSort((current) => nextSort(current, "key"))}
            emptyMessage={filter.trim() === "" ? "No properties." : "No properties match the filter."}
            className="min-h-0"
          />
        </Panel>
        <Separator
          aria-label="Resize property value"
          className="h-1 cursor-row-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel id="sle-property-value" minSize="20%" className="flex min-h-0 flex-col gap-1 pt-2">
          {chosen !== null && shown !== null ? (
            <>
              <p className="text-xs text-fg-muted">
                <span className="font-mono text-fg">{chosen}</span> · {FORMAT_LABELS[shown.format]}
                {shown.decoded ? " · decoded from base64" : ""}
              </p>
              {shown.format === "empty" ? (
                <EmptyState title="This property has no value." />
              ) : (
                <CodeEditor
                  value={shown.text}
                  readOnly
                  lineNumbers
                  folding
                  aria-label={`${chosen} value`}
                  className="flex-1"
                />
              )}
            </>
          ) : (
            <EmptyState title="Select a property to see its full value." />
          )}
        </Panel>
      </Group>
    </div>
  );
}
