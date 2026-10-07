import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Spinner, ToastProvider } from "../../shared/ui";
import { useToolStatus } from "../../shared/status";
import { usePolymorphicMetadata, useUnmanagedSolutions } from "./api/lookupApi";
import { DeleteLookupModal, DiscardChangesModal, RemoveRelationshipsModal } from "./components/LookupModals";
import { LookupEditorPane } from "./components/LookupEditorPane";
import {
  AttributesStep,
  LookupStep,
  SolutionStep,
  TableStep,
  type PickerStepId,
} from "./components/PickerSteps";
import { toLookupError } from "./model/apiError";
import { isElasticTable } from "./model/cascade";
import { buildDrafts, buildEditPlan, canCreateLookup, isExistingDirty, lookupSignature } from "./model/editPlan";
import { editorReducer, emptyEditor } from "./model/editorState";
import { joinSchema, prefixText, splitSchema } from "./model/schemaName";
import type { EditPlan, LookupColumn, PolymorphicEntity } from "./model/types";
import { useLookupWrites } from "./state/useLookupWrites";
import { useSessionConnection } from "./state/useSessionConnection";

export default function PolymorphicLookupCreator() {
  return (
    <ToastProvider>
      <PolymorphicLookupPage />
    </ToastProvider>
  );
}

function findLookup(table: PolymorphicEntity | null, logicalName: string | null): LookupColumn | undefined {
  if (!table || !logicalName) return undefined;
  return table.lookups.find(
    (lookup) =>
      lookup.logicalName === logicalName ||
      lookup.schemaName.toLowerCase() === logicalName.toLowerCase(),
  );
}

const byDisplayName = (a: PolymorphicEntity, b: PolymorphicEntity) =>
  a.displayName.localeCompare(b.displayName);

function PolymorphicLookupPage() {
  const [solutionUniqueName, setSolutionUniqueName] = useState<string | null>(null);
  const [tableLogicalName, setTableLogicalName] = useState<string | null>(null);
  const [editor, dispatch] = useReducer(editorReducer, emptyEditor);
  const [expandedPicker, setExpandedPicker] = useState<PickerStepId | null>("solution");
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<"discard" | "remove" | "delete" | null>(null);
  const pendingDiscard = useRef<(() => void) | null>(null);
  const pendingPlan = useRef<EditPlan | null>(null);
  /** Which lookup the editor was last loaded from, so metadata refreshes do not reload it. */
  const synced = useRef<string | null>(null);
  const seenConnection = useRef<string | null | undefined>(undefined);

  const { mode, drafts, originalDrafts, displayName, fragment, lookupLogicalName } = editor;
  const dirty =
    mode === "new"
      ? displayName.trim() !== "" || fragment !== "" || drafts.length > 0
      : mode === "existing" && isExistingDirty(drafts, originalDrafts);
  const connection = useSessionConnection(dirty);
  const solutionsQuery = useUnmanagedSolutions(connection.connectionName);
  const metadataQuery = usePolymorphicMetadata(connection.connectionName, !!solutionUniqueName);

  const solutions = solutionsQuery.data ?? [];
  const entities = useMemo(() => metadataQuery.data?.entities ?? [], [metadataQuery.data]);
  const solution = solutions.find((item) => item.uniqueName === solutionUniqueName) ?? null;
  const referencingTables = entities.filter((entity) => entity.canBeRelatedEntityInRelationship).sort(byDisplayName);
  const referencedTables = entities.filter((entity) => entity.canBePrimaryEntityInRelationship).sort(byDisplayName);
  const table = referencingTables.find((entity) => entity.logicalName === tableLogicalName) ?? null;
  const selectedLookup = findLookup(table, lookupLogicalName);
  const customizationPrefix = solution?.customizationPrefix ?? "";
  const schemaPrefix = mode === "existing" ? editor.existingPrefix : prefixText(customizationPrefix);
  const schemaName =
    mode === "existing" && selectedLookup ? selectedLookup.schemaName : joinSchema(customizationPrefix, fragment);
  const openLookupName =
    mode === "new" ? "New lookup" : selectedLookup?.displayName || (mode === "existing" ? displayName : "");
  const selectedDraft = drafts.find((draft) => draft.referencedLogicalName === editor.selectedReferenced) ?? null;
  const editPlan = mode === "existing" ? buildEditPlan(drafts, originalDrafts) : null;
  const ownTableError =
    table && drafts.some((draft) => draft.referencedLogicalName === table.logicalName)
      ? `${table.displayName} is the referencing table. Remove it from the attributes. A lookup cannot reference its own table.`
      : null;

  const writes = useLookupWrites({
    connectionName: connection.connectionName,
    solution,
    table,
    lookupAttribute: selectedLookup?.logicalName ?? lookupLogicalName,
    editor,
    dispatch,
    setNotice,
    closeModal: () => setModal(null),
    onCreated: () => {
      synced.current = "created";
    },
    onDeleted: () => {
      resetEditor();
      setExpandedPicker("lookups");
    },
  });
  const { writePhase } = writes;

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
  const saveEnabled = !!solution && !!table && !writePhase && ownTableError == null && editPlan?.plan != null;

  const signature = useMemo(() => {
    if (mode !== "existing" || !table || !lookupLogicalName) return null;
    const lookup = findLookup(table, lookupLogicalName);
    return lookup ? lookupSignature(table, lookup) : null;
  }, [lookupLogicalName, mode, table]);

  // A new connection starts the tool over.
  useEffect(() => {
    if (!connection.ready) return;
    if (seenConnection.current === connection.connectionName) return;
    const previous = seenConnection.current;
    seenConnection.current = connection.connectionName;
    if (previous === undefined) return;
    setSolutionUniqueName(null);
    setTableLogicalName(null);
    dispatch({ type: "reset" });
    setNotice(null);
    setModal(null);
    setExpandedPicker("solution");
    synced.current = null;
  }, [connection.connectionName, connection.ready]);

  // Load an existing lookup's relationships into the editor once its metadata is available.
  useEffect(() => {
    if (!signature || !table || !solution) return;
    if (synced.current === signature) return;
    const lookup = findLookup(table, lookupLogicalName);
    if (!lookup) return;
    synced.current = signature;
    const split = splitSchema(lookup.schemaName);
    dispatch({
      type: "loaded",
      drafts: buildDrafts(table, lookup, entities, solution.customizationPrefix),
      displayName: lookup.displayName,
      fragment: split.fragment,
      prefix: split.prefix,
    });
  }, [entities, lookupLogicalName, signature, solution, table]);

  /** Runs the action now, or after the user agrees to discard unsaved changes. */
  function guard(action: () => void) {
    if (!dirty) {
      action();
      return;
    }
    pendingDiscard.current = action;
    setModal("discard");
  }

  function resetEditor() {
    dispatch({ type: "reset" });
    synced.current = null;
  }

  function requestSave() {
    if (!editPlan?.plan) return;
    if (editPlan.plan.deletes.length > 0) {
      pendingPlan.current = editPlan.plan;
      setModal("remove");
      return;
    }
    void writes.save(editPlan.plan);
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

  const referencedName = (logicalName: string) =>
    referencedTables.find((item) => item.logicalName === logicalName)?.displayName ?? logicalName;
  const toggle = (step: PickerStepId, collapseTo: PickerStepId | null = null) => () =>
    setExpandedPicker((current) => (current === step ? collapseTo : step));

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas text-fg-strong">
      {!connection.ready ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Spinner />
        </div>
      ) : !connection.connectionName ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg">
          Right-click this tab and choose Change connection.
        </div>
      ) : (
        <Group orientation="horizontal" className="flex min-h-0 flex-1">
          <Panel defaultSize="50%" minSize="20%" className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden bg-surface p-3">
            <SolutionStep
              expanded={expandedPicker === "solution"}
              // Stays open until a table is chosen, so there is always a next step to show.
              onToggle={toggle("solution", table ? null : "solution")}
              solutions={solutions}
              solution={solution}
              query={{
                loading: solutionsQuery.isLoading,
                error: solutionsQuery.isError ? toLookupError(solutionsQuery.error) : null,
                onRetry: () => void solutionsQuery.refetch(),
              }}
              onSelect={(row) =>
                guard(() => {
                  setSolutionUniqueName(row.uniqueName);
                  setTableLogicalName(null);
                  setExpandedPicker("table");
                  resetEditor();
                })
              }
            />

            {solution ? (
              <TableStep
                expanded={expandedPicker === "table"}
                onToggle={toggle("table")}
                tables={referencingTables}
                table={table}
                query={{
                  loading: metadataQuery.isLoading,
                  error: metadataQuery.isError ? toLookupError(metadataQuery.error) : null,
                  onRetry: () => void metadataQuery.refetch(),
                }}
                onSelect={(row) =>
                  guard(() => {
                    setTableLogicalName(row.logicalName);
                    setExpandedPicker("lookups");
                    resetEditor();
                  })
                }
              />
            ) : null}

            {table ? (
              <LookupStep
                expanded={expandedPicker === "lookups"}
                onToggle={toggle("lookups", mode ? "attributes" : null)}
                table={table}
                entities={entities}
                mode={mode}
                selectedLookup={selectedLookup}
                query={{
                  loading: metadataQuery.isFetching && !metadataQuery.isLoading,
                  error: null,
                  onRetry: () => void metadataQuery.refetch(),
                }}
                busy={!!writePhase}
                onNew={() =>
                  guard(() => {
                    dispatch({ type: "startNew" });
                    setNotice(null);
                    setExpandedPicker("attributes");
                    synced.current = "new";
                  })
                }
                onDelete={() => setModal("delete")}
                onOpen={(row) =>
                  guard(() => {
                    synced.current = null;
                    dispatch({ type: "openExisting", logicalName: row.logicalName });
                    setNotice(null);
                    setExpandedPicker("attributes");
                  })
                }
              />
            ) : null}

            {mode ? (
              <AttributesStep
                expanded={expandedPicker === "attributes"}
                onToggle={toggle("attributes")}
                mode={mode}
                displayName={displayName}
                schemaPrefix={schemaPrefix}
                fragment={fragment}
                drafts={drafts}
                selectedReferenced={editor.selectedReferenced}
                referencedTables={referencedTables}
                selectedLookup={selectedLookup}
                ownTableError={ownTableError}
                busy={!!writePhase}
                onDisplayNameChange={(value) => dispatch({ type: "setDisplayName", value })}
                onFragmentChange={(value) => dispatch({ type: "setFragment", value })}
                onCheck={(row) => dispatch({ type: "selectReferenced", table: row, customizationPrefix })}
                onUncheck={(logicalName) => dispatch({ type: "uncheckReferenced", logicalName })}
                onSelect={(row) => dispatch({ type: "selectReferenced", table: row, customizationPrefix })}
              />
            ) : null}
          </Panel>
          <Separator
            aria-label="Resize panes"
            className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
          />
          <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto bg-surface p-3">
            <LookupEditorPane
              mode={mode}
              selectedDraft={selectedDraft}
              ownTableError={ownTableError}
              elastic={isElasticTable(table?.tableType)}
              createEnabled={createEnabled}
              saveEnabled={saveEnabled}
              writePhase={writePhase}
              showSpinner={!!writePhase && modal == null}
              onDraftChange={(patch) => {
                if (!selectedDraft) return;
                dispatch({
                  type: "updateDraft",
                  logicalName: selectedDraft.referencedLogicalName,
                  patch,
                  customizationPrefix,
                });
              }}
              onCreate={() => {
                if (createEnabled) void writes.create();
              }}
              onSave={requestSave}
              onCancel={() =>
                guard(() => {
                  resetEditor();
                  setExpandedPicker("lookups");
                })
              }
            />
          </Panel>
        </Group>
      )}

      <DiscardChangesModal
        open={connection.pendingName !== undefined || modal === "discard"}
        onCancel={() => {
          if (connection.pendingName !== undefined) connection.cancelSwitch();
          else setModal(null);
        }}
        onDiscard={() => {
          if (connection.pendingName !== undefined) {
            connection.confirmSwitch();
            return;
          }
          const action = pendingDiscard.current;
          pendingDiscard.current = null;
          setModal(null);
          action?.();
        }}
      />

      <RemoveRelationshipsModal
        open={modal === "remove"}
        tableNames={(pendingPlan.current?.deletes ?? []).map((draft) => ({
          key: draft.referencedLogicalName,
          label: referencedName(draft.referencedLogicalName),
        }))}
        busy={!!writePhase}
        onCancel={() => setModal(null)}
        onSave={() => {
          if (pendingPlan.current) void writes.save(pendingPlan.current);
        }}
      />

      <DeleteLookupModal
        open={modal === "delete"}
        displayName={selectedLookup?.displayName ?? displayName}
        schemaName={selectedLookup?.schemaName ?? schemaName}
        busy={!!writePhase}
        deleting={writePhase === "Deleting lookup…"}
        onCancel={() => setModal(null)}
        onDelete={() => void writes.remove()}
      />
    </div>
  );
}
