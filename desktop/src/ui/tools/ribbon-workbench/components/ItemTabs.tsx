import { useId, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Checkbox, DataTable, EmptyState, SearchInput, Toolbar } from "../../../shared/ui";
import {
  SOURCE_LABELS,
  actionSummary,
  itemRows,
  labelRows,
  matches,
  nextSort,
  sortBy,
  type ItemRow,
  type LabelRow,
  type SortState,
} from "../model/rows";
import { ruleReferences, usedBy } from "../model/edits";
import { elements } from "../model/node";
import { items } from "../model/diff";
import type { Problem, RibbonNode } from "../model/types";

function SourceBadge({ row }: { row: ItemRow }) {
  return <Badge tone={row.source === "base" ? "neutral" : "accent"}>{SOURCE_LABELS[row.source]}</Badge>;
}

const mono = (text: string) => <span className="font-mono text-xs">{text}</span>;

function rowKey(rows: readonly ItemRow[], id: string | null): string | null {
  const row = id ? rows.find((item) => item.id === id) : undefined;
  return row ? `${row.source}:${row.id}` : null;
}

interface ItemsFrameProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchLabel: string;
  newLabel: string;
  onNew: () => void;
  canEdit: boolean;
  showBase?: boolean;
  onShowBaseChange?: (value: boolean) => void;
  children: ReactNode;
}

function ItemsFrame(props: ItemsFrameProps) {
  const checkboxId = useId();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        aria-label={props.searchLabel}
        end={
          <Button variant="secondary" size="sm" disabled={!props.canEdit} onClick={props.onNew}>
            {props.newLabel}
          </Button>
        }
      >
        <SearchInput className="w-56" value={props.query} onChange={props.onQueryChange} aria-label={props.searchLabel} />
        {props.onShowBaseChange ? (
          <label htmlFor={checkboxId} className="flex items-center gap-1.5 text-xs text-fg">
            <Checkbox id={checkboxId} checked={!!props.showBase} onChange={props.onShowBaseChange} />
            Show base items
          </label>
        ) : null}
      </Toolbar>
      <div className="min-h-0 flex-1 p-2">{props.children}</div>
    </div>
  );
}

interface CommandsTabProps {
  diff: RibbonNode | null;
  baseCommands: RibbonNode[];
  customised: ReadonlySet<string>;
  baseCommandRefs: ReadonlySet<string>;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function CommandsTab(props: CommandsTabProps) {
  const [query, setQuery] = useState("");
  const [showBase, setShowBase] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const rows = useMemo(() => {
    const all = itemRows("command", props.diff, props.baseCommands, showBase, props.customised, props.baseCommandRefs);
    return sortBy(
      all.filter((row) => matches(query, row.id, actionSummary(row.node))),
      sort,
      (row, key) => (key === "source" ? row.source : key === "actions" ? actionSummary(row.node) : row.id),
    );
  }, [props.baseCommandRefs, props.baseCommands, props.customised, props.diff, query, showBase, sort]);

  const ownCount = items(props.diff, "command").length;
  return (
    <ItemsFrame
      query={query}
      onQueryChange={setQuery}
      searchLabel="Filter commands"
      newLabel="New command"
      onNew={props.onNew}
      canEdit={props.canEdit}
      showBase={showBase}
      onShowBaseChange={setShowBase}
    >
      {ownCount === 0 && !showBase ? (
        <EmptyState title="This solution does not define any commands. Turn on Show base items to see the built-in ones, or create one." />
      ) : (
        <DataTable<ItemRow>
          rows={rows}
          getRowKey={(row) => `${row.source}:${row.id}`}
          selectedKey={rowKey(rows, props.selectedId)}
          onRowClick={(row) => props.onSelect(row.id)}
          emptyMessage={query ? `No commands match ${query.trim()}.` : "No commands."}
          sortKey={sort?.key ?? null}
          sortDirection={sort?.direction}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          columns={[
            { key: "id", header: "Id", sortable: true, render: (row) => mono(row.id) },
            { key: "actions", header: "Actions", sortable: true, render: (row) => actionSummary(row.node) },
            {
              key: "enable",
              header: "Enable Rules",
              render: (row) => ruleReferences(row.node).enable.length,
            },
            {
              key: "display",
              header: "Display Rules",
              render: (row) => ruleReferences(row.node).display.length,
            },
            { key: "source", header: "Source", sortable: true, render: (row) => <SourceBadge row={row} /> },
          ]}
        />
      )}
    </ItemsFrame>
  );
}

interface RulesTabProps {
  kind: "enableRule" | "displayRule";
  diff: RibbonNode | null;
  baseRules: RibbonNode[];
  commands: RibbonNode[];
  customised: ReadonlySet<string>;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function RulesTab(props: RulesTabProps) {
  const [query, setQuery] = useState("");
  const [showBase, setShowBase] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const noun = props.kind === "enableRule" ? "enable rules" : "display rules";
  const rows = useMemo(() => {
    const all = itemRows(props.kind, props.diff, props.baseRules, showBase, props.customised, new Set());
    return sortBy(
      all.filter((row) => matches(query, row.id)),
      sort,
      (row, key) =>
        key === "steps"
          ? elements(row.node).length
          : key === "usedBy"
            ? usedBy(props.commands, props.kind, row.id).length
            : key === "source"
              ? row.source
              : row.id,
    );
  }, [props.baseRules, props.commands, props.customised, props.diff, props.kind, query, showBase, sort]);

  const ownCount = items(props.diff, props.kind).length;
  return (
    <ItemsFrame
      query={query}
      onQueryChange={setQuery}
      searchLabel={`Filter ${noun}`}
      newLabel="New rule"
      onNew={props.onNew}
      canEdit={props.canEdit}
      showBase={showBase}
      onShowBaseChange={setShowBase}
    >
      {ownCount === 0 && !showBase ? (
        <EmptyState title={`This solution does not define any ${noun}. Turn on Show base items to see the built-in ones, or create one.`} />
      ) : (
        <DataTable<ItemRow>
          rows={rows}
          getRowKey={(row) => `${row.source}:${row.id}`}
          onRowClick={(row) => props.onSelect(row.id)}
          selectedKey={rowKey(rows, props.selectedId)}
          emptyMessage={query ? `No ${noun} match ${query.trim()}.` : `No ${noun}.`}
          sortKey={sort?.key ?? null}
          sortDirection={sort?.direction}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          columns={[
            { key: "id", header: "Id", sortable: true, render: (row) => mono(row.id) },
            { key: "steps", header: "Steps", sortable: true, render: (row) => elements(row.node).length },
            { key: "usedBy", header: "Used By", sortable: true, render: (row) => usedBy(props.commands, props.kind, row.id).length },
            { key: "source", header: "Source", sortable: true, render: (row) => <SourceBadge row={row} /> },
          ]}
        />
      )}
    </ItemsFrame>
  );
}

interface LabelsTabProps {
  diff: RibbonNode | null;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function LabelsTab(props: LabelsTabProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const rows = useMemo(
    () =>
      sortBy(
        labelRows(props.diff).filter((row) => matches(query, row.id, row.text)),
        sort,
        (row, key) => (key === "lcid" ? Number(row.lcid) || 0 : key === "text" ? row.text : row.id),
      ),
    [props.diff, query, sort],
  );
  return (
    <ItemsFrame
      query={query}
      onQueryChange={setQuery}
      searchLabel="Filter labels"
      newLabel="New label"
      onNew={props.onNew}
      canEdit={props.canEdit}
    >
      {items(props.diff, "label").length === 0 ? (
        <EmptyState title="This solution does not define any labels. Create one." />
      ) : (
        <DataTable<LabelRow>
          rows={rows}
          getRowKey={(row) => row.key}
          onRowClick={(row) => props.onSelect(row.id)}
          selectedKey={rows.find((row) => row.id === props.selectedId)?.key ?? null}
          emptyMessage={`No labels match ${query.trim()}.`}
          sortKey={sort?.key ?? null}
          sortDirection={sort?.direction}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          columns={[
            { key: "id", header: "Id", sortable: true, render: (row) => mono(row.id) },
            { key: "lcid", header: "Language", sortable: true, render: (row) => row.lcid },
            { key: "text", header: "Text", sortable: true, render: (row) => row.text },
          ]}
        />
      )}
    </ItemsFrame>
  );
}

interface ProblemsTabProps {
  problems: Problem[];
  tableName: (key: string) => string;
  onSelect: (problem: Problem) => void;
}

export function ProblemsTab({ problems, tableName, onSelect }: ProblemsTabProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const rows = useMemo(
    () =>
      sortBy(
        problems.map((problem, index) => ({ ...problem, index })),
        sort,
        (row, key) =>
          key === "severity" ? row.severity : key === "table" ? tableName(row.table) : key === "item" ? row.item ?? "" : row.problem,
      ),
    [problems, sort, tableName],
  );
  return (
    <div className="h-full min-h-0 p-2">
      <DataTable
        rows={rows}
        getRowKey={(row) => String(row.index)}
        onRowClick={(row) => onSelect(row)}
        emptyMessage="No problems found."
        sortKey={sort?.key ?? null}
        sortDirection={sort?.direction}
        onSort={(key) => setSort((current) => nextSort(current, key))}
        columns={[
          {
            key: "severity",
            header: "Severity",
            sortable: true,
            render: (row) => <Badge tone={row.severity === "error" ? "danger" : "warn"}>{row.severity === "error" ? "Error" : "Warning"}</Badge>,
          },
          { key: "table", header: "Table", sortable: true, render: (row) => tableName(row.table) },
          { key: "item", header: "Item", sortable: true, render: (row) => (row.item ? mono(row.item) : "") },
          { key: "problem", header: "Problem", sortable: true, render: (row) => row.problem },
        ]}
      />
    </div>
  );
}
