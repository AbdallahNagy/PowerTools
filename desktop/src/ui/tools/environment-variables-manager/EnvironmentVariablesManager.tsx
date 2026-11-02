import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useConnection, useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import {
  Alert,
  Button,
  EmptyState,
  Modal,
  ProgressBar,
  SearchInput,
  Spinner,
  ToastProvider,
  Toolbar,
  Tooltip,
  useToast,
} from "../../shared/ui";
import {
  createDefinition,
  deleteDefinition,
  deleteValue,
  saveValues,
  updateDefinition,
  useEnvironmentVariables,
  useSolutions,
} from "./api/environmentVariablesApi";
import { environmentVariablesKeys } from "./api/queryKeys";
import { DeleteDialog } from "./components/DeleteDialog";
import { DetailsPanel } from "./components/DetailsPanel";
import { NewVariableDialog } from "./components/NewVariableDialog";
import { VariableTable } from "./components/VariableTable";
import { errorText } from "./model/apiError";
import { changedFields, hasChanges, type DefinitionForm } from "./model/definitionForm";
import type { CreateDefinitionBody, EnvironmentVariable, SaveValueResult } from "./model/types";
import {
  applySaved,
  DEFAULT_SORT,
  displayName,
  filterVariables,
  invalidCount,
  nextSort,
  pendingEdits,
  reconcileDrafts,
  saveToast,
  sortVariables,
  statusText,
  storedValue,
  withoutKey,
  type Drafts,
  type SaveResults,
  type SortState,
} from "./model/view";

/** Value edits are sent in small batches so progress can be shown. */
export const SAVE_BATCH_SIZE = 5;

const NO_VARIABLES: EnvironmentVariable[] = [];

type DeleteTarget = { kind: "variable" | "value"; variable: EnvironmentVariable };

export default function EnvironmentVariablesManager() {
  return (
    <ToastProvider>
      <Manager />
    </ToastProvider>
  );
}

function Manager() {
  const { connectionId } = useTabConnection();
  const connection = useConnection(connectionId);
  const onPremises = connection?.crmType === "onpremise";
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const listQuery = useEnvironmentVariables(connectionId);
  const variables = listQuery.data ?? NO_VARIABLES;

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [results, setResults] = useState<SaveResults>({});
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [definitionForm, setDefinitionForm] = useState<DefinitionForm | null>(null);
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [pendingSelect, setPendingSelect] = useState<{ id: string | null; focus: boolean } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const solutionsQuery = useSolutions(connectionId, newOpen);

  // A new environment starts clean. Unsaved edits belong to the previous one.
  const [lastConnection, setLastConnection] = useState(connectionId);
  const [droppedNotice, setDroppedNotice] = useState<{ count: number } | null>(null);
  if (lastConnection !== connectionId) {
    setLastConnection(connectionId);
    const dropped = Object.keys(drafts).length;
    setDrafts({});
    setResults({});
    setSelectedId(null);
    setDefinitionForm(null);
    setDefinitionError(null);
    setPendingSelect(null);
    setNewOpen(false);
    setDeleteTarget(null);
    if (dropped > 0) setDroppedNotice({ count: dropped });
  }
  useEffect(() => {
    if (!droppedNotice) return;
    const noun = droppedNotice.count === 1 ? "change" : "changes";
    showToast(`Discarded ${droppedNotice.count} unsaved ${noun} from the previous environment.`, "info");
  }, [droppedNotice, showToast]);

  const rows = useMemo(() => sortVariables(filterVariables(variables, search), sort), [variables, search, sort]);
  const selected = variables.find((variable) => variable.definitionId === selectedId) ?? null;
  const edits = pendingEdits(variables, drafts);
  const invalid = invalidCount(variables, drafts);
  const loading = listQuery.isFetching;
  const busy = loading || saving !== null;

  useToolStatus(
    connectionId && listQuery.data
      ? statusText({
          total: variables.length,
          shown: rows.length,
          filtered: search.trim() !== "",
          unsaved: edits.length,
          saving,
        })
      : null,
  );

  const updateList = (connection: string, change: (list: EnvironmentVariable[]) => EnvironmentVariable[]) => {
    queryClient.setQueryData<EnvironmentVariable[]>(environmentVariablesKeys.list(connection), (old) =>
      old ? change(old) : old,
    );
  };

  const reload = async () => {
    setResults((current) => Object.fromEntries(Object.entries(current).filter(([, result]) => !result.ok)));
    const refreshed = await listQuery.refetch();
    if (refreshed.data) {
      const data = refreshed.data;
      setDrafts((current) => reconcileDrafts(data, current));
    }
  };

  const select = (id: string | null, focus: boolean) => {
    setSelectedId(id);
    setDefinitionForm(null);
    setDefinitionError(null);
    if (focus) setFocusRequest((count) => count + 1);
  };

  const requestSelect = (id: string | null, focus = false) => {
    if (id === selectedId) {
      if (focus) setFocusRequest((count) => count + 1);
      return;
    }
    if (selected && hasChanges(selected, definitionForm)) {
      setPendingSelect({ id, focus });
      return;
    }
    select(id, focus);
  };

  const changeDraft = (variable: EnvironmentVariable, value: string) => {
    const id = variable.definitionId;
    setDrafts((current) => (value === storedValue(variable) ? withoutKey(current, id) : { ...current, [id]: value }));
    setResults((current) => (current[id]?.ok ? withoutKey(current, id) : current));
  };

  const save = async () => {
    if (!connectionId || edits.length === 0 || invalid > 0) return;
    const target = connectionId;
    const items = edits;
    setSaving({ done: 0, total: items.length });
    const all: SaveValueResult[] = [];
    for (let start = 0; start < items.length; start += SAVE_BATCH_SIZE) {
      const batch = items.slice(start, start + SAVE_BATCH_SIZE);
      try {
        const response = await saveValues(target, batch);
        all.push(...response.results);
      } catch (error) {
        const message = errorText(error);
        all.push(
          ...batch.map((item) => ({ definitionId: item.definitionId, valueId: item.valueId, ok: false, error: message })),
        );
      }
      setSaving({ done: all.length, total: items.length });
    }

    const sent = new Map(items.map((item) => [item.definitionId, item.value]));
    const saved = new Map<string, { valueId: string | null; value: string }>();
    for (const result of all) {
      const value = sent.get(result.definitionId);
      if (result.ok && value !== undefined) saved.set(result.definitionId, { valueId: result.valueId, value });
    }
    updateList(target, (list) => applySaved(list, saved));
    setDrafts((current) => {
      const next = { ...current };
      for (const [id, result] of saved) if (next[id] === result.value) delete next[id];
      return next;
    });
    setResults((current) => ({
      ...current,
      ...Object.fromEntries(all.map((result) => [result.definitionId, { ok: result.ok, error: result.error }])),
    }));
    setSaving(null);
    const toast = saveToast(all);
    showToast(toast.message, toast.type);
  };

  const saveDefinition = async () => {
    if (!connectionId || !selected || !definitionForm) return;
    const target = connectionId;
    const variable = selected;
    const form = definitionForm;
    setSavingDefinition(true);
    setDefinitionError(null);
    try {
      await updateDefinition(target, variable.definitionId, changedFields(variable, form));
      updateList(target, (list) =>
        list.map((item) =>
          item.definitionId === variable.definitionId
            ? {
                ...item,
                displayName: form.displayName.trim() || null,
                description: form.description || null,
                defaultValue: form.defaultValue || null,
              }
            : item,
        ),
      );
      setDefinitionForm(null);
      showToast("Definition saved.", "success");
    } catch (error) {
      setDefinitionError(errorText(error));
    } finally {
      setSavingDefinition(false);
    }
  };

  const create = async (body: CreateDefinitionBody) => {
    if (!connectionId) return;
    setNewBusy(true);
    setNewError(null);
    try {
      const created = await createDefinition(connectionId, body);
      setNewOpen(false);
      if (created.valueError) {
        showToast(`Variable created, but its current value was not saved: ${created.valueError}`, "info");
      } else {
        showToast("Variable created.", "success");
      }
      await reload();
      select(created.variable.definitionId, false);
    } catch (error) {
      setNewError(errorText(error));
    } finally {
      setNewBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!connectionId || !deleteTarget) return;
    const target = connectionId;
    const { kind, variable } = deleteTarget;
    const id = variable.definitionId;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (kind === "variable") {
        const response = await deleteDefinition(target, id);
        updateList(target, (list) => list.filter((item) => item.definitionId !== id));
        setSelectedId((current) => (current === id ? null : current));
        setDefinitionForm(null);
        const left = response.remainingValueIds.length;
        showToast(
          left > 0 ? `Variable deleted, but ${left} value row(s) were left behind.` : "Variable deleted.",
          left > 0 ? "info" : "success",
        );
      } else if (variable.valueId) {
        await deleteValue(target, variable.valueId);
        updateList(target, (list) =>
          list.map((item) =>
            item.definitionId === id
              ? { ...item, valueId: null, currentValue: null, valueIsManaged: false, managedValueSolutions: [] }
              : item,
          ),
        );
        showToast("Value deleted.", "success");
      }
      setDrafts((current) => withoutKey(current, id));
      setResults((current) => withoutKey(current, id));
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(errorText(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!connectionId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        <EmptyState className="flex-1" title="Connect to an environment to see its environment variables." />
      </div>
    );
  }

  let left;
  if (loading) {
    left = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3" role="status">
        <Spinner size={24} />
        <p className="text-sm text-fg">Loading environment variables…</p>
      </div>
    );
  } else if (listQuery.isError) {
    left = (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        }
      >
        {errorText(listQuery.error)}
      </Alert>
    );
  } else if (variables.length === 0) {
    left = (
      <EmptyState
        className="flex-1"
        title="This environment has no environment variables. Choose New Variable to create one."
      />
    );
  } else {
    left = (
      <VariableTable
        rows={rows}
        selectedId={selectedId}
        onSelect={(variable) => requestSelect(variable.definitionId)}
        sort={sort}
        onSort={(key) => setSort((current) => nextSort(current, key))}
        drafts={drafts}
        results={results}
        onDraftChange={changeDraft}
        onEditInPanel={(variable) => requestSelect(variable.definitionId, true)}
        disabled={saving !== null}
        emptyMessage={`No variables match "${search.trim()}".`}
      />
    );
  }

  const saveLabel = `Save Changes (${edits.length})`;
  const saveButton = (
    <Button size="sm" disabled={edits.length === 0 || invalid > 0 || busy} onClick={() => void save()}>
      {saveLabel}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <Toolbar
        aria-label="Environment variables"
        end={
          <>
            <Button variant="ghost" size="sm" disabled={edits.length === 0 || busy} onClick={() => setDrafts({})}>
              Discard Changes
            </Button>
            {invalid > 0 ? (
              <Tooltip content={`Fix ${invalid} invalid ${invalid === 1 ? "value" : "values"} first`}>
                <span tabIndex={0} className="inline-flex">
                  {saveButton}
                </span>
              </Tooltip>
            ) : (
              saveButton
            )}
          </>
        }
      >
        <SearchInput
          className="w-72 max-w-full"
          value={search}
          onChange={setSearch}
          placeholder="Filter by name, schema name, or value"
          aria-label="Filter by name, schema name, or value"
        />
        <Tooltip content="Reload from the environment">
          <Button variant="ghost" size="sm" aria-label="Refresh" disabled={busy} onClick={() => void reload()}>
            <RotateCw size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || listQuery.isError}
          onClick={() => {
            setNewError(null);
            setNewOpen(true);
          }}
        >
          New Variable
        </Button>
      </Toolbar>
      {saving ? (
        <div className="border-b border-line bg-surface px-3 py-2">
          <ProgressBar value={saving.done} max={saving.total} label={`Saving ${saving.done} of ${saving.total}…`} />
        </div>
      ) : null}
      <Group orientation="horizontal" className="flex min-h-0 flex-1">
        <Panel id="evm-list" defaultSize="62%" minSize="35%" className="flex min-h-0 min-w-0 flex-col bg-surface p-3">
          <div className="flex min-h-0 flex-1 flex-col">{left}</div>
        </Panel>
        <Separator aria-label="Resize panes" className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent" />
        <Panel id="evm-details" defaultSize="38%" minSize="25%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          {loading ? (
            <EmptyState title="Select a variable to edit its value and definition." />
          ) : (
            <DetailsPanel
              key={selected?.definitionId ?? "none"}
              variable={selected}
              drafts={drafts}
              results={results}
              onDraftChange={changeDraft}
              definitionForm={definitionForm}
              onDefinitionFormChange={setDefinitionForm}
              onSaveDefinition={() => void saveDefinition()}
              savingDefinition={savingDefinition}
              definitionError={definitionError}
              onDeleteValue={() => {
                if (!selected) return;
                setDeleteError(null);
                setDeleteTarget({ kind: "value", variable: selected });
              }}
              onDeleteVariable={() => {
                if (!selected) return;
                setDeleteError(null);
                setDeleteTarget({ kind: "variable", variable: selected });
              }}
              disabled={saving !== null}
              focusRequest={focusRequest}
            />
          )}
        </Panel>
      </Group>

      {pendingSelect ? (
        <Modal open title="Discard changes to this definition?" onClose={() => setPendingSelect(null)} widthClass="max-w-md">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingSelect(null)}>
              Keep Editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const next = pendingSelect;
                setPendingSelect(null);
                select(next.id, next.focus);
              }}
            >
              Discard
            </Button>
          </div>
        </Modal>
      ) : null}

      {newOpen ? (
        <NewVariableDialog
          onPremises={onPremises}
          solutions={solutionsQuery.data ?? []}
          solutionsLoading={solutionsQuery.isLoading}
          solutionsError={solutionsQuery.isError ? errorText(solutionsQuery.error) : null}
          busy={newBusy}
          error={newError}
          onCancel={() => setNewOpen(false)}
          onCreate={(body) => void create(body)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title={deleteTarget.kind === "variable" ? "Delete Variable" : "Delete Value"}
          message={
            deleteTarget.kind === "variable"
              ? `Delete ${displayName(deleteTarget.variable)}? Its current value is deleted too. This cannot be undone.`
              : `Delete the current value of ${displayName(deleteTarget.variable)}? The variable will use its default value.`
          }
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
