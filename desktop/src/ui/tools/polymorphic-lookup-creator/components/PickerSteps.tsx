import { useState } from "react";
import { Button, Checkbox, DataTable, SearchInput } from "../../../shared/ui";
import { isElasticTable } from "../model/cascade";
import { matchesQuery, prefixText, splitSchema } from "../model/schemaName";
import { targetLabels } from "../model/targetLabels";
import type { LookupColumn, PolymorphicEntity, RelationshipDraft, UnmanagedSolution } from "../model/types";
import { ListSection } from "./ListSection";
import { PickerStep } from "./PickerStep";
import { SchemaField, ToolTextInput } from "./ToolField";

export type PickerStepId = "solution" | "table" | "lookups" | "attributes";

interface StepState {
  expanded: boolean;
  onToggle: () => void;
}

interface QueryState {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function SolutionStep({
  solutions,
  solution,
  query,
  onSelect,
  ...step
}: StepState & {
  solutions: UnmanagedSolution[];
  solution: UnmanagedSolution | null;
  query: QueryState;
  onSelect: (solution: UnmanagedSolution) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = solutions.filter((item) =>
    matchesQuery(search, [item.friendlyName, item.customizationPrefix, item.uniqueName]),
  );

  return (
    <PickerStep
      title="Unmanaged solution"
      summary={solution ? `${solution.friendlyName} (${prefixText(solution.customizationPrefix)})` : null}
      {...step}
    >
      <ListSection
        title="Unmanaged solution"
        showHeading={false}
        search={search}
        onSearch={setSearch}
        placeholder="Search solutions"
        {...query}
      >
        <DataTable
          columns={[
            { key: "friendlyName", header: "Display name" },
            { key: "customizationPrefix", header: "Prefix" },
          ]}
          rows={rows}
          getRowKey={(row) => row.uniqueName}
          selectedKey={solution?.uniqueName ?? null}
          emptyMessage={solutions.length === 0 ? "No unmanaged solutions" : "No matching rows"}
          onRowClick={onSelect}
        />
        {solution ? (
          <p className="text-xs text-fg-muted">Prefix {prefixText(solution.customizationPrefix)}</p>
        ) : null}
      </ListSection>
    </PickerStep>
  );
}

export function TableStep({
  tables,
  table,
  query,
  onSelect,
  ...step
}: StepState & {
  tables: PolymorphicEntity[];
  table: PolymorphicEntity | null;
  query: QueryState;
  onSelect: (table: PolymorphicEntity) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = tables.filter((item) =>
    matchesQuery(search, [item.displayName, item.schemaName, item.logicalName]),
  );

  return (
    <PickerStep title="Referencing table" summary={table?.displayName ?? null} {...step}>
      <ListSection
        title="Referencing table"
        showHeading={false}
        search={search}
        onSearch={setSearch}
        placeholder="Search referencing tables"
        {...query}
      >
        <DataTable
          columns={[
            { key: "displayName", header: "Display name" },
            { key: "schemaName", header: "Schema name" },
          ]}
          rows={rows}
          getRowKey={(row) => row.logicalName}
          selectedKey={table?.logicalName ?? null}
          emptyMessage={tables.length === 0 ? "No tables can be the referencing side" : "No matching rows"}
          onRowClick={onSelect}
        />
        {isElasticTable(table?.tableType) ? (
          <p className="text-xs text-fg-muted">This referencing table is elastic.</p>
        ) : null}
        {table?.isSolutionAware ? (
          <p className="text-xs text-fg-muted">
            Polymorphic lookups are not supported on a solution-aware table.
          </p>
        ) : null}
      </ListSection>
    </PickerStep>
  );
}

export function LookupStep({
  table,
  entities,
  mode,
  selectedLookup,
  query,
  busy,
  onNew,
  onDelete,
  onOpen,
  ...step
}: StepState & {
  table: PolymorphicEntity;
  entities: PolymorphicEntity[];
  mode: "new" | "existing" | null;
  selectedLookup: LookupColumn | undefined;
  query: QueryState;
  busy: boolean;
  onNew: () => void;
  onDelete: () => void;
  onOpen: (lookup: LookupColumn) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = table.lookups.filter((item) =>
    matchesQuery(search, [item.displayName, item.schemaName, item.logicalName, ...item.targets]),
  );

  return (
    <PickerStep
      title="Lookups"
      summary={
        mode === "new"
          ? "New lookup"
          : selectedLookup
            ? `${selectedLookup.displayName} · ${selectedLookup.schemaName}`
            : null
      }
      {...step}
    >
      <ListSection
        title="Lookups"
        showHeading={false}
        search={search}
        onSearch={setSearch}
        placeholder="Search lookups"
        {...query}
      >
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={onNew}>
            New lookup
          </Button>
          <Button variant="secondary" disabled={!selectedLookup || busy} onClick={onDelete}>
            Delete
          </Button>
        </div>
        <DataTable
          columns={[
            { key: "displayName", header: "Display name" },
            { key: "schemaName", header: "Schema name" },
            {
              key: "attributes",
              header: "Attributes",
              render: (row) => targetLabels(entities, row.targets),
            },
          ]}
          rows={rows}
          getRowKey={(row) => row.logicalName}
          selectedKey={mode === "existing" ? selectedLookup?.logicalName ?? null : null}
          emptyMessage={table.lookups.length === 0 ? "No lookups on this table" : "No matching rows"}
          onRowClick={onOpen}
        />
      </ListSection>
    </PickerStep>
  );
}

export function AttributesStep({
  mode,
  displayName,
  schemaPrefix,
  fragment,
  drafts,
  selectedReferenced,
  referencedTables,
  selectedLookup,
  ownTableError,
  busy,
  onDisplayNameChange,
  onFragmentChange,
  onCheck,
  onUncheck,
  onSelect,
  ...step
}: StepState & {
  mode: "new" | "existing";
  displayName: string;
  schemaPrefix: string;
  fragment: string;
  drafts: RelationshipDraft[];
  selectedReferenced: string | null;
  referencedTables: PolymorphicEntity[];
  selectedLookup: LookupColumn | undefined;
  ownTableError: string | null;
  busy: boolean;
  onDisplayNameChange: (value: string) => void;
  onFragmentChange: (value: string) => void;
  onCheck: (table: PolymorphicEntity) => void;
  onUncheck: (logicalName: string) => void;
  onSelect: (table: PolymorphicEntity) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = referencedTables.filter((item) =>
    matchesQuery(search, [item.displayName, item.schemaName, item.logicalName]),
  );
  const selectedDraft = drafts.find((draft) => draft.referencedLogicalName === selectedReferenced);
  const isChecked = (logicalName: string) =>
    drafts.some((draft) => draft.referencedLogicalName === logicalName);

  return (
    <PickerStep
      title="Attributes"
      summary={
        selectedDraft
          ? referencedTables.find((item) => item.logicalName === selectedDraft.referencedLogicalName)
              ?.displayName ?? selectedDraft.referencedLogicalName
          : null
      }
      {...step}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ToolTextInput
          id="lookup-display-name"
          label="Display name"
          value={displayName}
          readOnly={mode === "existing"}
          onChange={mode === "new" ? onDisplayNameChange : undefined}
        />
        <SchemaField
          id="lookup-schema-name"
          label="Schema name"
          prefix={schemaPrefix}
          fragment={
            mode === "existing" && selectedLookup
              ? splitSchema(selectedLookup.schemaName).fragment
              : fragment
          }
          readOnly={mode === "existing"}
          onChange={mode === "new" ? onFragmentChange : undefined}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search attributes" />
        {drafts.length < 2 ? (
          <p className="text-xs text-fg-muted">Select at least two attributes.</p>
        ) : null}
        {ownTableError ? (
          <p role="alert" className="text-xs text-fg-strong">
            {ownTableError}
          </p>
        ) : null}
        <DataTable
          columns={[
            {
              key: "selected",
              header: "",
              width: "2.5rem",
              render: (row) => (
                <label className="inline-flex" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    id={`referenced-${row.logicalName}`}
                    checked={isChecked(row.logicalName)}
                    disabled={busy}
                    onChange={(checked) => (checked ? onCheck(row) : onUncheck(row.logicalName))}
                  />
                  <span className="sr-only">{row.displayName}</span>
                </label>
              ),
            },
            { key: "displayName", header: "Display name" },
            { key: "schemaName", header: "Schema name" },
          ]}
          rows={rows}
          getRowKey={(row) => row.logicalName}
          selectedKey={selectedReferenced}
          emptyMessage={
            referencedTables.length === 0 ? "No tables can be the referenced side" : "No matching rows"
          }
          onRowClick={onSelect}
        />
      </div>
    </PickerStep>
  );
}
