import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, DataTable, Modal, SearchInput, Spinner, ToastProvider, useToast } from "../../shared/ui";
import { useConnections } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { desktopBridge } from "../../platform/desktopBridge";
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
import { cascadeFields, isElasticTable, menuBehaviors, menuGroups } from "./model/cascade";
import {
  buildDrafts,
  buildEditPlan,
  canCreateLookup,
  isExistingDirty,
  lookupSignature,
  managedLabel,
  newRelationshipDraft,
  relationshipPayload,
} from "./model/editPlan";
import { toLookupError } from "./model/apiError";
import { joinSchema, matchesQuery, prefixText, splitSchema, suggestSchemaFragment } from "./model/schemaName";
import type { EditPlan, RelationshipDraft } from "./model/types";

const ABOUT_URL = "https://github.com/MscrmTools/MscrmTools.PolymorphicLookupCreator";

export default function PolymorphicLookupCreator() {
  return (
    <ToastProvider>
      <PolymorphicLookupPage />
    </ToastProvider>
  );
}

function useSessionConnection(dirty: boolean) {
  const { activeConnectionName, isActiveConnectionLoaded, setActiveConnection } = useConnections();
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null | undefined>(undefined);
  const initialized = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!isActiveConnectionLoaded) return;
    if (!initialized.current) {
      initialized.current = true;
      setSessionName(activeConnectionName);
      return;
    }
    if (activeConnectionName === sessionName) {
      setPendingName(undefined);
      return;
    }
    if (!dirtyRef.current) {
      setSessionName(activeConnectionName);
      return;
    }
    setPendingName(activeConnectionName);
  }, [activeConnectionName, isActiveConnectionLoaded, sessionName]);

  return {
    connectionName: isActiveConnectionLoaded ? sessionName : null,
    ready: isActiveConnectionLoaded,
    pendingName,
    confirmSwitch() {
      setSessionName(pendingName ?? null);
      setPendingName(undefined);
    },
    cancelSwitch() {
      setPendingName(undefined);
      if (sessionName) void setActiveConnection(sessionName);
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
  const saveEnabled = !!solution && !!table && !writePhase && editPlan?.plan != null;
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
          Select an environment from the connection control at the bottom of the tool sidebar.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <section className="flex w-1/2 min-w-0 flex-col gap-4 overflow-auto border-r border-[var(--color-border-dark)] bg-[var(--color-bg-darker)] p-3">
            <ListSection
              title="Unmanaged solution"
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

            {solution ? (
              <ListSection
                title="Referencing table"
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
                      resetEditor();
                    })
                  }
                />
                {elastic ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    New relationships on this table use no cascade.
                  </p>
                ) : null}
                {table?.isSolutionAware ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    Polymorphic lookups are not supported on a solution-aware table.
                  </p>
                ) : null}
              </ListSection>
            ) : null}

            {table ? (
              <ListSection
                title="Lookups"
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
                      key: "managed",
                      header: "Managed or unmanaged",
                      render: (row) => managedLabel(row.isManaged),
                    },
                    {
                      key: "targets",
                      header: "Referenced tables",
                      render: (row) =>
                        row.targets
                          .map(
                            (target) =>
                              entities.find((entity) => entity.logicalName === target)?.displayName ??
                              target,
                          )
                          .join(", "),
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
                    })
                  }
                />
              </ListSection>
            ) : null}
          </section>

          <section className="flex w-1/2 min-w-0 flex-col gap-3 overflow-auto bg-[var(--color-bg-darker)] p-3">
            {mode == null ? (
              <p className="text-sm text-[var(--color-text-gray)]">Select a lookup or create one.</p>
            ) : (
              <>
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
                  fragment={mode === "existing" && selectedLookup ? splitSchema(selectedLookup.schemaName).fragment : fragment}
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
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm text-[var(--color-text-white)]">Referenced tables</h3>
                  <SearchInput
                    value={referencedSearch}
                    onChange={setReferencedSearch}
                    placeholder="Search referenced tables"
                  />
                  {drafts.length < 2 ? (
                    <p className="text-xs text-[var(--color-text-dark-gray)]">
                      Select at least two referenced tables.
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
                                  setDrafts((current) =>
                                    current.filter((draft) => draft.referencedLogicalName !== row.logicalName),
                                  );
                                  setSelectedReferenced((current) =>
                                    current === row.logicalName ? null : current,
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
                {selectedDraft ? (
                  <RelationshipFields
                    draft={selectedDraft}
                    elastic={elastic}
                    disabled={!!writePhase}
                    onChange={(patch) => updateDraft(selectedDraft.referencedLogicalName, patch)}
                  />
                ) : null}
                {elastic ? (
                  <p className="text-xs text-[var(--color-text-dark-gray)]">
                    New relationships on this table use no cascade.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  {mode === "new" ? (
                    <Button disabled={!createEnabled} onClick={() => void runCreate()}>
                      Create lookup
                    </Button>
                  ) : (
                    <Button
                      disabled={!saveEnabled}
                      onClick={() => {
                        if (!editPlan?.plan) return;
                        if (editPlan.plan.deletes.length > 0) {
                          pendingPlan.current = editPlan.plan;
                          setModal("remove");
                          return;
                        }
                        void runSave(editPlan.plan);
                      }}
                    >
                      Save
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    disabled={!!writePhase}
                    onClick={() => guard(resetEditor)}
                  >
                    Cancel
                  </Button>
                  {writePhase && modal == null ? <Spinner /> : null}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <footer className="shrink-0 border-t border-[var(--color-border-dark)] px-3 py-2 text-xs text-[var(--color-text-dark-gray)]">
        Polymorphic Lookup Creator by MscrmTools.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void desktopBridge.openExternalUrl(ABOUT_URL)}
        >
          {ABOUT_URL}
        </button>
      </footer>

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

function ListSection({
  title,
  search,
  onSearch,
  placeholder,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm text-[var(--color-text-white)]">{title}</h2>
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
  elastic,
  disabled,
  onChange,
}: {
  draft: RelationshipDraft;
  elastic: boolean;
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
      <fieldset disabled={elastic || disabled} className="grid grid-cols-2 gap-2">
        {cascadeFields.map((field) => (
          <ToolSelect
            key={field.key}
            id={`cascade-${field.key}`}
            label={`Cascade ${field.label}`}
            value={field.value}
            disabled={elastic || disabled}
            options={[{ value: field.value, label: field.option }]}
          />
        ))}
      </fieldset>
    </div>
  );
}
