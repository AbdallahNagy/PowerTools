import type { ReactNode } from "react";
import { Alert, Badge, Button, DataTable, EmptyState, SearchInput, Spinner, Tabs } from "../../../shared/ui";
import type { Drafts } from "../model/drafts";
import { effectiveSortKey, langSortKey, type SortState } from "../model/grid";
import {
  GLOBAL_SCOPE,
  TABLE_TABS,
  cellId,
  labelName,
  languageHeader,
  rowId,
  tabDefinition,
  type ComponentTab,
} from "../model/labels";
import type { Language, LabelRow, TableInfo } from "../model/types";
import { LabelCell } from "./LabelCell";

interface LabelGridProps {
  scope: string | null;
  table: TableInfo | null;
  tab: ComponentTab;
  onTabChange: (tab: ComponentTab) => void;
  editsByTab: ReadonlyMap<ComponentTab, number>;
  rows: readonly LabelRow[];
  visibleRows: LabelRow[];
  loading: boolean;
  errorText: string | null;
  onRetry: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  sort: SortState;
  onSort: (key: string) => void;
  languages: readonly Language[];
  baseLcid: number;
  drafts: Drafts;
  onEdit: (row: LabelRow, lcid: number, value: string) => void;
}

export function LabelGrid(props: LabelGridProps) {
  const { scope, table, tab, onTabChange, editsByTab, query, onQueryChange } = props;

  if (!scope) {
    return <EmptyState className="flex-1" title="Select a table or Global choices to see its labels." />;
  }

  const isGlobal = scope === GLOBAL_SCOPE;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-base font-semibold text-fg-strong">
            {isGlobal ? "Global choices" : table?.displayName || scope}
          </h2>
          {!isGlobal ? <span className="truncate font-mono text-xs text-fg-muted">{scope}</span> : null}
        </div>
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Filter by name or any label"
          aria-label="Filter labels"
        />
      </div>
      {isGlobal ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <GridBody {...props} />
        </div>
      ) : (
        <Tabs
          aria-label="Component"
          className="min-h-0 flex-1 px-3 pt-1"
          value={tab}
          onValueChange={(value) => onTabChange(value as ComponentTab)}
          items={TABLE_TABS.map((definition) => ({
            value: definition.tab,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {definition.title}
                {editsByTab.get(definition.tab) ? (
                  <Badge tone="accent">{editsByTab.get(definition.tab)}</Badge>
                ) : null}
              </span>
            ),
            content: (
              <div className="flex h-full min-h-0 flex-col py-3">
                {definition.tab === tab ? <GridBody {...props} /> : null}
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}

function GridBody({
  scope,
  tab,
  rows,
  visibleRows,
  loading,
  errorText,
  onRetry,
  query,
  sort,
  onSort,
  languages,
  baseLcid,
  drafts,
  onEdit,
}: LabelGridProps) {
  const definition = tabDefinition(scope === GLOBAL_SCOPE ? "global" : tab);

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center gap-2 p-6">
        <Spinner />
        <span className="text-fg">Loading {definition.noun}…</span>
      </div>
    );
  }

  if (errorText) {
    return (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {errorText}
      </Alert>
    );
  }

  if (rows.length === 0) return <EmptyState className="flex-1" title={definition.emptyMessage} />;

  const kind = definition.kind;
  const columns: {
    key: string;
    header: ReactNode;
    sortable: boolean;
    width?: string;
    render: (row: LabelRow) => ReactNode;
  }[] = [
    {
      key: "component",
      header: "Component",
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[160px] max-w-[260px] flex-col">
          <span className="truncate text-fg" title={row.component}>
            {row.component}
          </span>
          {row.componentName && row.componentName !== row.component ? (
            <span className="truncate font-mono text-2xs text-fg-muted">{row.componentName}</span>
          ) : null}
          {kind === "view" && row.detail ? (
            <span className="truncate text-2xs text-fg-muted">{row.detail}</span>
          ) : null}
        </span>
      ),
    },
  ];
  if (kind === "choice" || kind === "globalChoice") {
    columns.push({
      key: "value",
      header: "Value",
      sortable: true,
      render: (row) => <span className="font-mono">{row.key.value ?? ""}</span>,
    });
  }
  if (kind === "relationship") {
    columns.push({ key: "type", header: "Type", sortable: true, render: (row) => row.detail ?? "" });
  }
  columns.push({
    key: "label",
    header: "Label",
    sortable: true,
    render: (row) => <span className="whitespace-nowrap">{labelName(row)}</span>,
  });
  for (const language of languages) {
    const isBase = language.lcid === baseLcid;
    const header = languageHeader(language);
    columns.push({
      key: langSortKey(language.lcid),
      header: (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {header}
          {isBase ? <Badge>Base</Badge> : null}
        </span>
      ),
      sortable: true,
      width: "220px",
      render: (row) => (
        <LabelCell
          row={row}
          lcid={language.lcid}
          baseLcid={baseLcid}
          draft={drafts.get(cellId(rowId(row.key), language.lcid))}
          ariaLabel={`${row.component} ${labelName(row)} ${header}`}
          onEdit={onEdit}
        />
      ),
    });
  }

  return (
    <DataTable
      className="min-h-0"
      columns={columns}
      rows={visibleRows}
      getRowKey={(row) => rowId(row.key)}
      sortKey={effectiveSortKey(sort)}
      sortDirection={sort.direction}
      onSort={onSort}
      emptyMessage={query.trim() ? `No labels match "${query.trim()}".` : "No labels of this kind."}
    />
  );
}
