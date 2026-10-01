import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button, Checkbox, DataTable, Modal, SearchInput, Spinner, ToastProvider, useToast } from "../../shared/ui";
import { useTabConnection } from "../../shared/connections";
import { usePrimaryAction } from "../../shared/keyboard";
import { useToolStatus } from "../../shared/status";
import {
  addRelationship,
  createLookup,
  deleteLookupColumn,
  deleteRelationship,
  updateRelationship,
  usePolymorphicMetadata,
  useUnmanagedSolutions,
} from "./api/lookupApi";
import { polymorphicKeys } from "./api/queryKeys";
import { SchemaField, ToolSelect, ToolTextInput } from "./components/ToolField";
import {
  cascadeBehaviors,
  cascadeFields,
  isElasticTable,
  menuBehaviors,
  menuGroups,
  presetCascade,
} from "./model/cascade";
import {
  buildDrafts,
  buildEditPlan,
  canCreateLookup,
  isExistingDirty,
  lookupSignature,
  newRelationshipDraft,
  relationshipPayload,
} from "./model/editPlan";
import { toLookupError } from "./model/apiError";
import { joinSchema, matchesQuery, prefixText, splitSchema, suggestSchemaFragment } from "./model/schemaName";
import type { CascadeBehavior, EditPlan, RelationshipDraft } from "./model/types";

export default function PolymorphicLookupCreator() {
  return (
    <ToastProvider>
      <PolymorphicLookupPage />
    </ToastProvider>
  );
}

function useSessionConnection(dirty: boolean) {
  const { connectionName: tabConnectionName, setConnectionName } = useTabConnection();
  const [sessionName, setSessionName] = useState<string | null>(tabConnectionName);
  const [pendingName, setPendingName] = useState<string | null | undefined>(undefined);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const sessionRef = useRef(sessionName);
  sessionRef.current = sessionName;

  useEffect(() => {
    if (tabConnectionName === sessionRef.current) {
      setPendingName(undefined);
      return;
    }
    if (!dirtyRef.current) {
      setSessionName(tabConnectionName);
      return;
    }
    setPendingName(tabConnectionName);
  }, [tabConnectionName]);

  return {
    connectionName: sessionName,
    ready: true,
    pendingName,
    confirmSwitch() {
      setSessionName(pendingName ?? null);
      setPendingName(undefined);
    },
    cancelSwitch() {
      setPendingName(undefined);
      setConnectionName(sessionRef.current);
    },
  };
}

function PolymorphicLookupPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [solutionUniqueName, setSolutionUniqueName] = useState<string | null>(null);
  const [tableLogicalName, setTableLogicalName] = useState<string | null>(null);
  const [lookupLogicalName, setLookupLogicalName] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing" | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [fragment, setFragment] = useState("");
  const [fragmentEdited, setFragmentEdited] = useState(false);
  const [existingPrefix, setExistingPrefix] = useState("");
  const [drafts, setDrafts] = useState<RelationshipDraft[]>([]);
  const [originalDrafts, setOriginalDrafts] = useState<RelationshipDraft[]>([]);
  const [selectedReferenced, setSelectedReferenced] = useState<string | null>(null);
  const [expandedPicker, setExpandedPicker] = useState<"solution" | "table" | "lookups" | "attributes" | null>("solution");
  const [solutionSearch, setSolutionSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [lookupSearch, setLookupSearch] = useState("");
  const [referencedSearch, setReferencedSearch] = useState("");
  const [writePhase, setWritePhase] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<"discard" | "remove" | "delete" | null>(null);
  const pendingDiscard = useRef<(() => void) | null>(null);
  const pendingPlan = useRef<EditPlan | null>(null);
  const synced = useRef<string | null>(null);
  const seenConnection = useRef<string | null | undefined>(undefined);

  const dirty =
    mode === "new"
      ? displayName.trim() !== "" || fragment !== "" || drafts.length > 0
      : mode === "existing" && isExistingDirty(drafts, originalDrafts);
  const connection = useSessionConnection(dirty);
  const solutionsQuery = useUnmanagedSolutions(connection.connectionName);
  const metadataQuery = usePolymorphicMetadata(connection.connectionName, !!solutionUniqueName);

  const solutions = solutionsQuery.data ?? [];
  const entities = useMemo(
    () => metadataQuery.data?.entities ?? [],
    [metadataQuery.data],
  );
  const solution = solutions.find((item) => item.uniqueName === solutionUniqueName) ?? null;
  const referencingTables = entities
    .filter((entity) => entity.canBeRelatedEntityInRelationship)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const referencedTables = entities
    .filter((entity) => entity.canBePrimaryEntityInRelationship)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const table = referencingTables.find((entity) => entity.logicalName === tableLogicalName) ?? null;
  const selectedLookup = table?.lookups.find(
    (lookup) =>
      lookup.logicalName === lookupLogicalName ||
      lookup.schemaName.toLowerCase() === lookupLogicalName?.toLowerCase(),
  );
  const customizationPrefix = solution?.customizationPrefix ?? "";
  const schemaPrefix = mode === "existing" ? existingPrefix : prefixText(customizationPrefix);
  const schemaName = mode === "existing" && selectedLookup
    ? selectedLookup.schemaName
    : joinSchema(customizationPrefix, fragment);
  const openLookupName = mode === "new" ? "New lookup" : selectedLookup?.displayName || (mode === "existing" ? displayName : "");
  const selectedDraft = drafts.find((draft) => draft.referencedLogicalName === selectedReferenced) ?? null;
  const editPlan = mode === "existing" ? buildEditPlan(drafts, originalDrafts) : null;
  const createEnabled =
    !!solution &&
    !!table &&
    !writePhase &&
    canCreateLookup({
      displayName,
      schemaName: joinSchema(customizationPrefix, fragment),
      referencedLogicalNames: drafts.map((draft) => draft.referencedLogicalName),
      referencingLogicalName: table?.logicalName ?? "",
      solutionAware: table?.isSolutionAware === true,
    });
  const ownTableError =
    table && drafts.some((draft) => draft.referencedLogicalName === table.logicalName)
      ? `${table.displayName} is the referencing table. Remove it from the attributes. A lookup cannot reference its own table.`
      : null;
  const referencesOwnTable = ownTableError != null;
  const saveEnabled =
    !!solution && !!table && !writePhase && !referencesOwnTable && editPlan?.plan != null;
  const elastic = isElasticTable(table?.tableType);

  const signature = useMemo(() => {
    if (mode !== "existing" || !table || !lookupLogicalName) return null;
    const lookup = table.lookups.find(
      (item) =>
        item.logicalName === lookupLogicalName ||
        item.schemaName.toLowerCase() === lookupLogicalName.toLowerCase(),
    );
    return lookup ? lookupSignature(table, lookup) : null;
  }, [lookupLogicalName, mode, table]);

  useEffect(() => {
    if (!connection.ready) return;
    if (seenConnection.current === connection.connectionName) return;
    const previous = seenConnection.current;
    seenConnection.current = connection.connectionName;
    if (previous === undefined) return;
    setSolutionUniqueName(null);
    setTableLogicalName(null);
    setLookupLogicalName(null);
    setMode(null);
    setDisplayName("");
    setFragment("");
    setFragmentEdited(false);
    setExistingPrefix("");
    setDrafts([]);
    setOriginalDrafts([]);
    setSelectedReferenced(null);
    setNotice(null);
    setModal(null);
    setExpandedPicker("solution");
    synced.current = null;
  }, [connection.connectionName, connection.ready]);

  useEffect(() => {
    if (!signature || !table || !solution) return;
    if (synced.current === signature) return;
    const lookup = table.lookups.find(
      (item) =>
        item.logicalName === lookupLogicalName ||
        item.schemaName.toLowerCase() === lookupLogicalName?.toLowerCase(),
    );
    if (!lookup) return;
    synced.current = signature;
    const built = buildDrafts(table, lookup, entities, solution.customizationPrefix);
    const split = splitSchema(lookup.schemaName);
    setDrafts(built);
    setOriginalDrafts(built);
    setDisplayName(lookup.displayName);
    setFragment(split.fragment);
    setExistingPrefix(split.prefix);
    setFragmentEdited(true);
  }, [entities, lookupLogicalName, signature, solution, table]);

  function guard(action: () => void) {
    if (!dirty) {
      action();
      return;
    }
    pendingDiscard.current = action;
    setModal("discard");
  }

  function resetEditor() {
    setLookupLogicalName(null);
    setMode(null);
    setDisplayName("");
    setFragment("");
    setFragmentEdited(false);
    setExistingPrefix("");
    setDrafts([]);
    setOriginalDrafts([]);
    setSelectedReferenced(null);
    synced.current = null;
  }

  const contextLine = [solution?.friendlyName, table?.displayName, openLookupName].filter(Boolean).join(", ");
  let status: string | null = null;
  if (!connection.ready) status = null;
  else if (!connection.connectionName) status = "No environment selected";
  else if (writePhase) status = writePhase;
  else if (solutionsQuery.isLoading) status = "Loading solutions…";
  else if ((metadataQuery.isLoading || metadataQuery.isFetching) && table) status = "Loading lookups…";
  else if (metadataQuery.isLoading || metadataQuery.isFetching) status = "Loading tables…";
  else if (notice) status = contextLine ? `${contextLine}. ${notice}` : notice;
  else status = contextLine || null;
  useToolStatus(status);

  async function refreshMetadata() {
    if (!connection.connectionName) return;
    await queryClient.invalidateQueries({
      queryKey: polymorphicKeys.metadata(connection.connectionName),
    });
  }

  async function runCreate() {
    if (!connection.connectionName || !solution || !table || !createEnabled) return;
    setWritePhase("Creating lookup…");
    setNotice(null);
    try {
      const createdSchema = joinSchema(customizationPrefix, fragment);
      await createLookup(connection.connectionName, {
        solutionUniqueName: solution.uniqueName,
        referencingEntityLogicalName: table.logicalName,
        displayName: displayName.trim(),
        schemaName: createdSchema,
        relationships: drafts.map(relationshipPayload),
      });
      const saved = drafts.map((draft) => ({ ...draft, saved: true, fragmentEdited: true }));
      setDrafts(saved);
      setOriginalDrafts(saved);
      setExistingPrefix(prefixText(customizationPrefix));
      setFragmentEdited(true);
      synced.current = "created";
      setMode("existing");
      setLookupLogicalName(createdSchema.toLowerCase());
      showToast("Lookup created", "success");
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
    } finally {
      setWritePhase(null);
    }
  }

  async function runSave(plan: EditPlan) {
    if (!connection.connectionName || !solution || !table || !lookupLogicalName) return;
    setNotice(null);
    let applied = 0;
    const completedAdds: RelationshipDraft[] = [];
    const completedDeletes = new Set<string>();
    try {
      for (const add of plan.adds) {
        setWritePhase("Saving lookup… Adding relationships…");
        await addRelationship(connection.connectionName, {
          solutionUniqueName: solution.uniqueName,
          referencingEntityLogicalName: table.logicalName,
          referencingAttributeLogicalName: selectedLookup?.logicalName ?? lookupLogicalName,
          relationship: relationshipPayload(add),
        });
        applied += 1;
        completedAdds.push({ ...add, saved: true, fragmentEdited: true });
      }
      for (const removal of plan.deletes) {
        setWritePhase("Saving lookup… Removing relationships…");
        await deleteRelationship(
          connection.connectionName,
          removal.schemaName,
          table.logicalName,
        );
        applied += 1;
        completedDeletes.add(removal.referencedLogicalName);
      }
      for (const update of plan.updates) {
        setWritePhase("Saving lookup… Updating relationships…");
        const payload = relationshipPayload(update);
        await updateRelationship(connection.connectionName, update.schemaName, {
          referencingEntityLogicalName: table.logicalName,
          isValidForAdvancedFind: payload.isValidForAdvancedFind,
          cascade: payload.cascade,
          associatedMenuBehavior: payload.associatedMenuBehavior,
          associatedMenuGroup: payload.associatedMenuGroup,
          associatedMenuOrder: payload.associatedMenuOrder,
          associatedMenuLabel: payload.associatedMenuLabel,
        });
        applied += 1;
      }
      const saved = drafts
        .filter((draft) => !plan.deletes.some((item) => item.referencedLogicalName === draft.referencedLogicalName))
        .map((draft) => ({ ...draft, saved: true, fragmentEdited: true }));
      setDrafts(saved);
      setOriginalDrafts(saved);
      setModal(null);
      showToast("Lookup saved", "success");
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
      if (applied > 0) {
        setNotice("Earlier changes remain applied.");
        setOriginalDrafts((current) => [
          ...current.filter((draft) => !completedDeletes.has(draft.referencedLogicalName)),
          ...completedAdds,
        ]);
        setDrafts((current) =>
          current
            .filter((draft) => !completedDeletes.has(draft.referencedLogicalName))
            .map((draft) => {
              const added = completedAdds.find(
                (item) => item.referencedLogicalName === draft.referencedLogicalName,
              );
              return added ?? draft;
            }),
        );
      }
      setModal(null);
    } finally {
      setWritePhase(null);
    }
  }

  async function runDelete() {
    if (!connection.connectionName || !table || !lookupLogicalName) return;
    setWritePhase("Deleting lookup…");
    setNotice(null);
    try {
      await deleteLookupColumn(
        connection.connectionName,
        table.logicalName,
        selectedLookup?.logicalName ?? lookupLogicalName,
      );
      showToast("Lookup deleted", "success");
      resetEditor();
      setExpandedPicker("lookups");
      setModal(null);
      await refreshMetadata();
    } catch (error) {
      showToast(toLookupError(error), "error");
      setModal(null);
    } finally {
      setWritePhase(null);
    }
  }

  function updateDraft(logicalName: string, patch: Partial<RelationshipDraft>) {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.referencedLogicalName !== logicalName) return draft;
        const next = { ...draft, ...patch };
        if (!next.saved && patch.fragment !== undefined) {
          next.schemaName = joinSchema(customizationPrefix, next.fragment);
        }
        return next;
      }),
    );
  }

  const filteredSolutions = solutions.filter((item) =>
    matchesQuery(solutionSearch, [item.friendlyName, item.customizationPrefix, item.uniqueName]),
  );
  const filteredTables = referencingTables.filter((item) =>
    matchesQuery(tableSearch, [item.displayName, item.schemaName, item.logicalName]),
  );
  const filteredLookups = (table?.lookups ?? []).filter((item) =>
    matchesQuery(lookupSearch, [item.displayName, item.schemaName, item.logicalName, ...item.targets]),
  );
  const filteredReferenced = referencedTables.filter((item) =>
    matchesQuery(referencedSearch, [item.displayName, item.schemaName, item.logicalName]),
  );

  const discardOpen = connection.pendingName !== undefined || modal === "discard";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-dark)] text-[var(--color-text-white)]">
      {!connection.ready ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Spinner />
        </div>
      ) : !connection.connectionName ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--color-text-gray)]">
          Right-click this tab and choose Change connection.
        </div>
      ) : (
        <Group orientation="horizontal" className="flex min-h-0 flex-1">
          <Panel defaultSize="50%" minSize="20%" className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden bg-[var(--color-bg-darker)] p-3">
            <PickerStep
              title="Unmanaged solution"
              summary={solution ? `${solution.friendlyName} (${prefixText(solution.customizationPrefix)})` : null}
              expanded={expandedPicker === "solution"}
              onToggle={() =>
                setExpandedPicker((current) =>
                  current === "solution" ? (table ? null : "solution") : "solution",
                )
              }
            >
            <ListSection
              title="Unmanaged solution"
              showHeading={false}
              search={solutionSearch}
              onSearch={setSolutionSearch}
              placeholder="Search solutions"
              loading={solutionsQuery.isLoading}
              error={solutionsQuery.isError ? toLookupError(solutionsQuery.error) : null}
              onRetry={() => void solutionsQuery.refetch()}
            >
              <DataTable
                columns={[
                  { key: "friendlyName", header: "Display name" },
                  { key: "customizationPrefix", header: "Prefix" },
                ]}
                rows={filteredSolutions}
                getRowKey={(row) => row.uniqueName}
                selectedKey={solutionUniqueName}
                emptyMessage={solutions.length === 0 ? "No unmanaged solutions" : "No matching rows"}
                onRowClick={(row) =>
                  guard(() => {
                    setSolutionUniqueName(row.uniqueName);
                    setTableLogicalName(null);
                    setExpandedPicker("table");
                    resetEditor();
                  })
                }
              />
              {solution ? (
                <p className="text-xs text-[var(--color-text-dark-gray)]">
                  Prefix {prefixText(solution.customizationPrefix)}
                </p>
              ) : null}
            </ListSection>
            </PickerStep>

            {solution ? (
              <PickerStep
                title="Referencing table"
                summary={table?.displayName ?? null}
                expanded={expandedPicker === "table"}
                onToggle={() =>
                  setExpandedPicker((current) => (current === "table" ? null : "table"))
                }
              >
              <ListSection
                title="Referencing table"
                showHeading={false}
                search={tableSearch}
                onSearch={setTableSearch}
                placeholder="Search referencing tables"
                loading={metadataQuery.isLoading}
                error={metadataQuery.isError ? toLookupError(metadataQuery.error) : null}
                onRetry={() => void metadataQuery.refetch()}
              >
                <DataTable
                  columns={[
                    { key: "displayName", header: "Display name" },
                    { key: "schemaName", header: "Schema name" },
                  ]}
                  rows={filteredTables}
                  getRowKey={(row) => row.logicalName}
                  selectedKey={tableLogicalName}
                  emptyMessage={
                    referencingTables.length === 0
                      ? "No tables can be the referencing side"
                      : "No matching rows"
                  }
                  onRowClick={(row) =>
                    guard(() => {
                      setTableLogicalName(row.logicalName);
                      setExpandedPicker("lookups");
                      resetEditor();
                    })
                  }
                />
                {elastic ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    This referencing table is elastic.
                  </p>
                ) : null}
                {table?.isSolutionAware ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    Polymorphic lookups are not supported on a solution-aware table.
                  </p>
                ) : null}
              </ListSection>
              </PickerStep>
            ) : null}

            {table ? (
              <PickerStep
                title="Lookups"
                summary={
                  mode === "new"
                    ? "New lookup"
                    : selectedLookup
                      ? `${selectedLookup.displayName} · ${selectedLookup.schemaName}`
                      : null
                }
                expanded={expandedPicker === "lookups"}
                onToggle={() =>
                  setExpandedPicker((current) =>
                    current === "lookups" ? (mode ? "attributes" : null) : "lookups",
                  )
                }
              >
              <ListSection
                title="Lookups"
                showHeading={false}
                search={lookupSearch}
                onSearch={setLookupSearch}
                placeholder="Search lookups"
                loading={metadataQuery.isFetching && !metadataQuery.isLoading}
                error={null}
                onRetry={() => void metadataQuery.refetch()}
              >
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={!!writePhase}
                    onClick={() => guard(() => {
                      setLookupLogicalName(null);
                      setMode("new");
                      setDisplayName("");
                      setFragment("");
                      setFragmentEdited(false);
                      setExistingPrefix("");
                      setDrafts([]);
                      setOriginalDrafts([]);
                      setSelectedReferenced(null);
                      setNotice(null);
                      setExpandedPicker("attributes");
                      synced.current = "new";
                    })}
                  >
                    New lookup
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!selectedLookup || !!writePhase}
                    onClick={() => setModal("delete")}
                  >
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
                  rows={filteredLookups}
                  getRowKey={(row) => row.logicalName}
                  selectedKey={mode === "existing" ? selectedLookup?.logicalName ?? null : null}
                  emptyMessage={
                    (table.lookups.length === 0) ? "No lookups on this table" : "No matching rows"
                  }
                  onRowClick={(row) =>
                    guard(() => {
                      synced.current = null;
                      setMode("existing");
                      setLookupLogicalName(row.logicalName);
                      setSelectedReferenced(null);
                      setNotice(null);
                      setExpandedPicker("attributes");
                    })
                  }
                />
              </ListSection>
              </PickerStep>
            ) : null}

            {mode ? (
              <PickerStep
                title="Attributes"
                summary={
                  selectedDraft
                    ? referencedTables.find((item) => item.logicalName === selectedDraft.referencedLogicalName)
                        ?.displayName ?? selectedDraft.referencedLogicalName
                    : null
                }
                expanded={expandedPicker === "attributes"}
                onToggle={() =>
                  setExpandedPicker((current) => (current === "attributes" ? null : "attributes"))
                }
              >
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <ToolTextInput
                    id="lookup-display-name"
                    label="Display name"
                    value={displayName}
                    readOnly={mode === "existing"}
                    onChange={
                      mode === "new"
                        ? (value) => {
                            setDisplayName(value);
                            if (!fragmentEdited) setFragment(suggestSchemaFragment(value));
                          }
                        : undefined
                    }
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
                    onChange={
                      mode === "new"
                        ? (value) => {
                            setFragmentEdited(true);
                            setFragment(value);
                          }
                        : undefined
                    }
                  />
                  <SearchInput
                    value={referencedSearch}
                    onChange={setReferencedSearch}
                    placeholder="Search attributes"
                  />
                  {drafts.length < 2 ? (
                    <p className="text-xs text-[var(--color-text-dark-gray)]">
                      Select at least two attributes.
                    </p>
                  ) : null}
                  {ownTableError ? (
                    <p role="alert" className="text-xs text-[var(--color-text-white)]">
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
                              checked={drafts.some((draft) => draft.referencedLogicalName === row.logicalName)}
                              disabled={!!writePhase}
                              onChange={(checked) => {
                                if (!checked) {
                                  const remaining = drafts.filter(
                                    (draft) => draft.referencedLogicalName !== row.logicalName,
                                  );
                                  setDrafts(remaining);
                                  setSelectedReferenced((current) =>
                                    current === row.logicalName
                                      ? remaining[0]?.referencedLogicalName ?? null
                                      : current,
                                  );
                                  return;
                                }
                                setDrafts((current) =>
                                  current.some((draft) => draft.referencedLogicalName === row.logicalName)
                                    ? current
                                    : [...current, newRelationshipDraft(row, customizationPrefix)],
                                );
                                setSelectedReferenced(row.logicalName);
                              }}
                            />
                            <span className="sr-only">{row.displayName}</span>
                          </label>
                        ),
                      },
                      { key: "displayName", header: "Display name" },
                      { key: "schemaName", header: "Schema name" },
                    ]}
                    rows={filteredReferenced}
                    getRowKey={(row) => row.logicalName}
                    selectedKey={selectedReferenced}
                    emptyMessage={
                      referencedTables.length === 0
                        ? "No tables can be the referenced side"
                        : "No matching rows"
                    }
                    onRowClick={(row) => {
                      const exists = drafts.some((draft) => draft.referencedLogicalName === row.logicalName);
                      if (!exists) {
                        setDrafts((current) => [...current, newRelationshipDraft(row, customizationPrefix)]);
                      }
                      setSelectedReferenced(row.logicalName);
                    }}
                  />
                </div>
              </PickerStep>
            ) : null}
          </Panel>
          <Separator
            aria-label="Resize panes"
            className="w-1 cursor-col-resize bg-[var(--color-bg-light)] hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)]"
          />
          <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto bg-[var(--color-bg-darker)] p-3">
            {mode == null ? (
              <p className="text-sm text-[var(--color-text-gray)]">Select a lookup or create one.</p>
            ) : (
              <>
            {ownTableError ? (
              <p role="alert" className="text-xs text-[var(--color-text-white)]">
                {ownTableError}
              </p>
            ) : null}
            {selectedDraft ? (
              <>
                <RelationshipFields
                  draft={selectedDraft}
                  disabled={!!writePhase}
                  onChange={(patch) => updateDraft(selectedDraft.referencedLogicalName, patch)}
                />
                {elastic ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    This referencing table is elastic.
                  </p>
                ) : null}
                <LookupActions
                  mode={mode}
                  createEnabled={createEnabled}
                  saveEnabled={saveEnabled}
                  writePhase={writePhase}
                  showSpinner={!!writePhase && modal == null}
                  onCreate={() => void runCreate()}
                  onSave={() => {
                    if (!editPlan?.plan) return;
                    if (editPlan.plan.deletes.length > 0) {
                      pendingPlan.current = editPlan.plan;
                      setModal("remove");
                      return;
                    }
                    void runSave(editPlan.plan);
                  }}
                  onCancel={() =>
                    guard(() => {
                      resetEditor();
                      setExpandedPicker("lookups");
                    })
                  }
                />
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-gray)]">Select an attribute.</p>
                <LookupActions
                  mode={mode}
                  createEnabled={createEnabled}
                  saveEnabled={saveEnabled}
                  writePhase={writePhase}
                  showSpinner={!!writePhase && modal == null}
                  onCreate={() => void runCreate()}
                  onSave={() => {
                    if (!editPlan?.plan) return;
                    if (editPlan.plan.deletes.length > 0) {
                      pendingPlan.current = editPlan.plan;
                      setModal("remove");
                      return;
                    }
                    void runSave(editPlan.plan);
                  }}
                  onCancel={() =>
                    guard(() => {
                      resetEditor();
                      setExpandedPicker("lookups");
                    })
                  }
                />
              </>
            )}
              </>
            )}
          </Panel>
        </Group>
      )}

      <Modal
        open={discardOpen}
        title="Discard unsaved changes?"
        onClose={() => {
          if (connection.pendingName !== undefined) connection.cancelSwitch();
          else setModal(null);
        }}
      >
        <p className="text-sm text-[var(--color-text-gray)]">Discard unsaved lookup changes?</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (connection.pendingName !== undefined) connection.cancelSwitch();
              else setModal(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (connection.pendingName !== undefined) {
                connection.confirmSwitch();
                return;
              }
              const action = pendingDiscard.current;
              pendingDiscard.current = null;
              setModal(null);
              action?.();
            }}
          >
            Discard
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal === "remove"}
        title="Remove relationships?"
        busy={!!writePhase}
        busyLabel="Saving lookup…"
        onClose={() => {
          if (!writePhase) setModal(null);
        }}
      >
        <p className="text-sm text-[var(--color-text-gray)]">These referenced tables will be removed:</p>
        <ul className="list-disc pl-5 text-sm text-[var(--color-text-white)]">
          {(pendingPlan.current?.deletes ?? []).map((draft) => (
            <li key={draft.referencedLogicalName}>
              {referencedTables.find((item) => item.logicalName === draft.referencedLogicalName)?.displayName ??
                draft.referencedLogicalName}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={!!writePhase} onClick={() => setModal(null)}>
            Cancel
          </Button>
          <Button
            disabled={!!writePhase}
            onClick={() => {
              if (pendingPlan.current) void runSave(pendingPlan.current);
            }}
          >
            Save
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal === "delete"}
        title="Delete lookup"
        busy={writePhase === "Deleting lookup…"}
        busyLabel="Deleting lookup…"
        onClose={() => {
          if (!writePhase) setModal(null);
        }}
      >
        <p className="text-sm text-[var(--color-text-gray)]">
          Delete {selectedLookup?.displayName ?? displayName} ({selectedLookup?.schemaName ?? schemaName})?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={!!writePhase} onClick={() => setModal(null)}>
            Cancel
          </Button>
          <Button disabled={!!writePhase} onClick={() => void runDelete()}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function targetLabels(
  entities: Array<{ logicalName: string; displayName: string }>,
  targets: string[],
): string {
  return targets
    .map((target) => entities.find((entity) => entity.logicalName === target)?.displayName ?? target)
    .join(", ");
}

function LookupActions({
  mode,
  createEnabled,
  saveEnabled,
  writePhase,
  showSpinner,
  onCreate,
  onSave,
  onCancel,
}: {
  mode: "new" | "existing";
  createEnabled: boolean;
  saveEnabled: boolean;
  writePhase: string | null;
  showSpinner: boolean;
  onCreate: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  usePrimaryAction({
    label: mode === "new" ? "Create lookup" : "Save",
    enabled: mode === "new" ? createEnabled : saveEnabled,
    run: mode === "new" ? onCreate : onSave,
  });

  return (
    <div className="flex gap-2">
      {mode === "new" ? (
        <Button disabled={!createEnabled} onClick={onCreate}>
          Create lookup
        </Button>
      ) : (
        <Button disabled={!saveEnabled} onClick={onSave}>
          Save
        </Button>
      )}
      <Button variant="secondary" disabled={!!writePhase} onClick={onCancel}>
        Cancel
      </Button>
      {showSpinner ? <Spinner /> : null}
    </div>
  );
}

function PickerStep({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string | null;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={expanded ? "flex min-h-0 flex-1 flex-col gap-2" : "shrink-0"}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={summary ? `${title}, ${summary}` : title}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] px-3 py-2 text-left hover:bg-[var(--color-hover-bg)]"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-[var(--color-text-dark-gray)] ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="text-sm text-[var(--color-text-white)]">{title}</span>
        {summary ? (
          <span className="truncate text-xs text-[var(--color-text-dark-gray)]">{summary}</span>
        ) : null}
      </button>
      {expanded ? <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">{children}</div> : null}
    </div>
  );
}

function ListSection({
  title,
  showHeading = true,
  search,
  onSearch,
  placeholder,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  showHeading?: boolean;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className={showHeading ? "flex min-h-0 flex-1 flex-col gap-2" : "flex min-h-0 flex-1 flex-col gap-2"}>
      {showHeading ? <h2 className="text-sm text-[var(--color-text-white)]">{title}</h2> : null}
      <SearchInput value={search} onChange={onSearch} placeholder={placeholder} />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
          <Spinner />
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
          <span>{error}</span>
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? null : (
        children
      )}
    </div>
  );
}

function RelationshipFields({
  draft,
  disabled,
  onChange,
}: {
  draft: RelationshipDraft;
  disabled: boolean;
  onChange: (patch: Partial<RelationshipDraft>) => void;
}) {
  const split = splitSchema(draft.schemaName);
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border-dark)] pt-3">
      <SchemaField
        id="relationship-schema-name"
        label="Relationship schema name"
        prefix={split.prefix}
        fragment={draft.saved ? split.fragment : draft.fragment}
        readOnly={draft.saved || disabled}
        onChange={
          draft.saved
            ? undefined
            : (value) => onChange({ fragment: value, fragmentEdited: true })
        }
      />
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-gray)]">
        <Checkbox
          id="advanced-find"
          checked={draft.isValidForAdvancedFind}
          disabled={disabled}
          onChange={(checked) => onChange({ isValidForAdvancedFind: checked })}
        />
        Advanced Find
      </label>
      <ToolSelect
        id="menu-behavior"
        label="Associated menu"
        value={draft.menuBehavior}
        options={menuBehaviors}
        disabled={disabled}
        onChange={(value) => onChange({ menuBehavior: value as RelationshipDraft["menuBehavior"] })}
      />
      <ToolSelect
        id="menu-group"
        label="Display zone"
        value={draft.menuGroup}
        options={menuGroups}
        disabled={disabled}
        onChange={(value) => onChange({ menuGroup: value as RelationshipDraft["menuGroup"] })}
      />
      <ToolTextInput
        id="menu-order"
        label="Display order"
        value={String(draft.menuOrder)}
        readOnly={disabled}
        onChange={(value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          onChange({ menuOrder: Math.min(99999, Math.max(10000, parsed)) });
        }}
      />
      <ToolTextInput
        id="menu-label"
        label="Custom label"
        value={draft.menuLabel}
        readOnly={disabled}
        onChange={(value) => onChange({ menuLabel: value })}
      />
      <ToolSelect
        id="cascade-behavior"
        label="Cascade behavior"
        value={draft.cascadeBehavior}
        options={cascadeBehaviors}
        disabled={disabled}
        onChange={(value) => {
          const behavior = value as CascadeBehavior;
          onChange(
            behavior === "Custom"
              ? { cascadeBehavior: behavior }
              : { cascadeBehavior: behavior, cascade: presetCascade(behavior) },
          );
        }}
      />
      {draft.cascadeBehavior === "Custom" ? (
        <div className="grid grid-cols-2 gap-2">
          {cascadeFields.map((field) => (
            <ToolSelect
              key={field.key}
              id={`cascade-${field.key}`}
              label={field.label}
              value={draft.cascade[field.key]}
              disabled={disabled}
              options={field.options}
              onChange={(value) =>
                onChange({
                  cascadeBehavior: "Custom",
                  cascade: {
                    ...draft.cascade,
                    [field.key]: value as RelationshipDraft["cascade"]["assign"],
                  },
                })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
