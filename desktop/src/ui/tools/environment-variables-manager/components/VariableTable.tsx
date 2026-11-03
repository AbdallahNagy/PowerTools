import type { ReactNode, SyntheticEvent } from "react";
import { Badge, Button, DataTable, Input } from "../../../shared/ui";
import { valueKind, valueReadOnlyReason, type EnvironmentVariable } from "../model/types";
import {
  displayName,
  draftError,
  isDirty,
  storedValue,
  type Drafts,
  type SaveResults,
  type SortKey,
  type SortState,
} from "../model/view";
import { BooleanSelect } from "./ValueEditor";

interface VariableTableProps {
  rows: EnvironmentVariable[];
  selectedId: string | null;
  onSelect: (variable: EnvironmentVariable) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  drafts: Drafts;
  results: SaveResults;
  onDraftChange: (variable: EnvironmentVariable, value: string) => void;
  /** Selects the row and focuses its editor in the details panel (JSON and Secret). */
  onEditInPanel: (variable: EnvironmentVariable) => void;
  disabled: boolean;
  emptyMessage: string;
}

/** Keeps clicks and keys inside an inline editor from selecting the row. */
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0] ?? "";
}

function DefaultHint() {
  return <span className="shrink-0 text-xs text-fg-muted">Default</span>;
}

function ValueCell(props: {
  variable: EnvironmentVariable;
  drafts: Drafts;
  onDraftChange: (variable: EnvironmentVariable, value: string) => void;
  onEditInPanel: (variable: EnvironmentVariable) => void;
  disabled: boolean;
}): ReactNode {
  const { variable, drafts, onDraftChange, onEditInPanel, disabled } = props;
  const name = displayName(variable);
  const draft = drafts[variable.definitionId];
  const value = draft ?? storedValue(variable);
  const usesDefault = variable.valueId === null && value === "";
  const invalid = draftError(variable, drafts) !== null;

  if (variable.conflictingValues.length > 0) {
    return <span className="text-fg-muted">{variable.conflictingValues.length} values</span>;
  }

  const kind = valueKind(variable.type);
  if (kind === "json" || kind === "secret" || valueReadOnlyReason(variable) !== null) {
    const shown = usesDefault ? (variable.defaultValue ?? "") : value;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`min-w-0 flex-1 truncate font-mono text-xs ${usesDefault || kind === "json" ? "text-fg-muted" : ""}`}
          title={shown}
        >
          {firstLine(shown)}
        </span>
        {usesDefault && shown ? <DefaultHint /> : null}
        {valueReadOnlyReason(variable) === null ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Edit value of ${name}`}
            onClick={(event) => {
              event.stopPropagation();
              onEditInPanel(variable);
            }}
          >
            Edit
          </Button>
        ) : null}
      </div>
    );
  }

  const label = `Current value of ${name}`;
  return (
    <div className="flex min-w-0 items-center gap-2" onClick={stop} onKeyDown={stop} onDoubleClick={stop}>
      {kind === "boolean" ? (
        <BooleanSelect
          value={value}
          onChange={(next) => onDraftChange(variable, next)}
          disabled={disabled}
          invalid={invalid}
          aria-label={label}
          className="min-w-20 flex-1"
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onDraftChange(variable, event.target.value)}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          className="min-w-0 flex-1 py-1"
        />
      )}
      {usesDefault && variable.defaultValue ? <DefaultHint /> : null}
    </div>
  );
}

function StateBadges({ variable, drafts, results }: { variable: EnvironmentVariable; drafts: Drafts; results: SaveResults }) {
  const result = results[variable.definitionId];
  const dirty = isDirty(variable, drafts);
  return (
    <div className="flex flex-wrap gap-1">
      {variable.valueIsManaged ? <Badge tone="warn">Managed value</Badge> : null}
      {variable.conflictingValues.length > 0 ? <Badge tone="danger">Conflict</Badge> : null}
      {!variable.isActive ? <Badge>Inactive</Badge> : null}
      {dirty ? <Badge tone="accent">Edited</Badge> : null}
      {draftError(variable, drafts) !== null ? <Badge tone="danger">Invalid</Badge> : null}
      {result?.ok && !dirty ? <Badge tone="ok">Saved</Badge> : null}
      {result && !result.ok ? <Badge tone="danger">Failed</Badge> : null}
    </div>
  );
}

export function VariableTable({
  rows,
  selectedId,
  onSelect,
  sort,
  onSort,
  drafts,
  results,
  onDraftChange,
  onEditInPanel,
  disabled,
  emptyMessage,
}: VariableTableProps) {
  return (
    <DataTable<EnvironmentVariable>
      rows={rows}
      getRowKey={(row) => row.definitionId}
      selectedKey={selectedId}
      onRowClick={onSelect}
      sortKey={sort.key}
      sortDirection={sort.direction}
      onSort={(key) => onSort(key as SortKey)}
      emptyMessage={emptyMessage}
      className="h-full"
      columns={[
        {
          key: "displayName",
          header: "Display Name",
          sortable: true,
          width: "30%",
          render: (row) => <span className="font-medium text-fg">{displayName(row)}</span>,
        },
        {
          key: "schemaName",
          header: "Schema Name",
          sortable: true,
          width: "20%",
          render: (row) => <span className="break-all font-mono text-xs text-fg-muted">{row.schemaName}</span>,
        },
        { key: "type", header: "Type", sortable: true, width: "9%", render: (row) => row.typeLabel },
        {
          key: "currentValue",
          header: "Current Value",
          sortable: true,
          width: "28%",
          render: (row) => (
            <ValueCell
              variable={row}
              drafts={drafts}
              onDraftChange={onDraftChange}
              onEditInPanel={onEditInPanel}
              disabled={disabled}
            />
          ),
        },
        {
          key: "state",
          header: "State",
          width: "13%",
          render: (row) => <StateBadges variable={row} drafts={drafts} results={results} />,
        },
      ]}
    />
  );
}
