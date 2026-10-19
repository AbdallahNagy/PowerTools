import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTabConnection } from "../../../shared/connections";
import { useToast } from "../../../shared/ui";
import {
  fetchPublishJob,
  loadSolution,
  publishAgain as requestPublishAgain,
  startPublish,
  useBaseRibbon,
  useSolutions,
  validateDiffs,
} from "../api/ribbonApi";
import { plural, rejectedProblems, toRibbonError } from "../model/apiError";
import {
  TABLE_LOCATIONS,
  applicationLocations,
  barIds,
  buildCommandBar,
  findBarNode,
  labelMap,
  tabOf,
  type BarNode,
} from "../model/commandBar";
import { countChanges, findItem, items, removeItem, type ItemKind } from "../model/diff";
import {
  addChild as addChildToDiff,
  customiseCommand as customiseCommandInDiff,
  deleteCustom,
  hide,
  newCommand,
  newId,
  newLabel,
  newRule,
  replaceItem,
  setGroupLayout as setGroupLayoutInDiff,
  show,
  updateControl as updateControlInDiff,
  type AddKind,
  type IdContext,
} from "../model/edits";
import { attr, sameNode } from "../model/node";
import {
  APPLICATION_KEY,
  type LoadResponse,
  type Problem,
  type PublishJob,
  type RibbonNode,
} from "../model/types";

const POLL_MS = 1000;

export type WorkspaceTab = "commandBar" | "commands" | "enableRules" | "displayRules" | "labels" | "problems";

export type SelectionKind = "control" | "command" | "enableRule" | "displayRule" | "label";
export interface Selection {
  kind: SelectionKind;
  id: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading"; uniqueName: string }
  | { status: "error"; uniqueName: string; message: string }
  | { status: "ready"; data: LoadResponse };

type PublishState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "confirm" }
  | { phase: "running"; jobId: string | null; job: PublishJob | null };

export interface Banner {
  id: string;
  tone: "info" | "ok" | "warn" | "danger";
  title?: string;
  text: string;
  details?: string[];
  action?: "publishAgain" | "reload";
}

export type ConfirmKind = { kind: "discard" } | { kind: "switch"; next: string } | { kind: "reload" } | null;

export interface TableRow {
  key: string;
  displayName: string;
  logicalName: string | null;
  ribbonNotSupported: boolean;
  readOnlyReason: string | null;
}

export const ITEM_TAB: Record<Exclude<SelectionKind, "control">, WorkspaceTab> = {
  command: "commands",
  enableRule: "enableRules",
  displayRule: "displayRules",
  label: "labels",
};

function phaseText(job: PublishJob | null): string {
  switch (job?.phase) {
    case "importing":
      return `importing ${Math.round(job.progress)}%`;
    case "publishing":
      return "publishing";
    case "done":
      return "finishing";
    default:
      return "exporting";
  }
}

/** Solution, tables, edits, validation, and the publish flow for one Ribbon Editor tab. */
export function useRibbonWorkbench() {
  const { connectionId } = useTabConnection();
  const connection = connectionId || null;
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [solutionName, setSolutionName] = useState("");
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [loadedDiffs, setLoadedDiffs] = useState<Record<string, RibbonNode>>({});
  const [diffs, setDiffs] = useState<Record<string, RibbonNode>>({});
  const [selectedKey, setSelectedKey] = useState<string>(APPLICATION_KEY);
  const [tab, setTab] = useState<WorkspaceTab>("commandBar");
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tableQuery, setTableQuery] = useState("");
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [publish, setPublish] = useState<PublishState>({ phase: "idle" });
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [customised, setCustomised] = useState<ReadonlySet<string>>(() => new Set());
  const [discarded, setDiscarded] = useState(false);

  const loadAbort = useRef<AbortController | null>(null);
  const changes = useMemo(
    () => Object.keys(diffs).reduce((sum, key) => sum + countChanges(loadedDiffs[key], diffs[key]), 0),
    [diffs, loadedDiffs],
  );

  // Reset during render so the new environment never renders with the previous one's solution or edits.
  const [stateConnection, setStateConnection] = useState(connection);
  if (stateConnection !== connection) {
    setStateConnection(connection);
    if (changes > 0) setDiscarded(true);
    setSolutionName("");
    setLoad({ status: "idle" });
    setLoadedDiffs({});
    setDiffs({});
    setSelectedKey(APPLICATION_KEY);
    setTab("commandBar");
    setLocations({});
    setSelection(null);
    setTableQuery("");
    setProblems(null);
    setBanners([]);
    setPublish({ phase: "idle" });
    setConfirm(null);
    setCustomised(new Set());
  }

  useEffect(() => {
    if (!discarded) return;
    showToast("Unsaved command bar changes were discarded because the environment changed.", "info");
    setDiscarded(false);
  }, [discarded, showToast]);

  useEffect(() => () => loadAbort.current?.abort(), []);
  useEffect(() => {
    loadAbort.current?.abort();
  }, [connection]);

  const solutionsQuery = useSolutions(connection);
  const solutions = useMemo(() => solutionsQuery.data?.solutions ?? [], [solutionsQuery.data]);
  const data = load.status === "ready" ? load.data : null;
  const publishing = publish.phase === "running";

  const tables = useMemo<TableRow[]>(() => {
    if (!data) return [];
    return [
      {
        key: APPLICATION_KEY,
        displayName: "Application ribbon",
        logicalName: null,
        ribbonNotSupported: false,
        readOnlyReason: data.applicationRibbon.readOnlyReason,
      },
      ...data.entities.map((entity) => ({
        key: entity.logicalName,
        displayName: entity.displayName,
        logicalName: entity.logicalName,
        ribbonNotSupported: entity.ribbonNotSupported,
        readOnlyReason: entity.readOnlyReason,
      })),
    ];
  }, [data]);

  const selectedTable = tables.find((table) => table.key === selectedKey) ?? null;
  const editedKeys = useMemo(
    () => new Set(Object.keys(diffs).filter((key) => !sameNode(loadedDiffs[key], diffs[key]))),
    [diffs, loadedDiffs],
  );

  const baseQuery = useBaseRibbon(connection, selectedKey, !!data && !!selectedTable && !selectedTable.ribbonNotSupported);
  const appBaseQuery = useBaseRibbon(connection, APPLICATION_KEY, !!data);
  const base = baseQuery.data ?? null;

  const readOnlyReason = (key: string): string | null => {
    if (!data) return "No solution is loaded.";
    if (!data.canPublish) return data.readOnlyReason ?? "You cannot publish changes in this environment.";
    const table = tables.find((item) => item.key === key);
    if (!table) return "This table is not in the solution.";
    if (table.ribbonNotSupported) return "This table does not support a command bar.";
    if (table.readOnlyReason) return table.readOnlyReason;
    if (!diffs[key]) return "This table has no command bar definition in the solution.";
    return null;
  };
  const selectedReadOnly = readOnlyReason(selectedKey);
  const canEdit = !publishing && selectedReadOnly === null;

  const locationOptions = useMemo(
    () => (selectedKey === APPLICATION_KEY ? applicationLocations(base?.tabs ?? []) : TABLE_LOCATIONS),
    [base, selectedKey],
  );
  const location = locations[selectedKey] ?? (selectedKey === APPLICATION_KEY ? locationOptions[0]?.value ?? null : "HomepageGrid");

  const currentDiff = diffs[selectedKey] ?? null;
  const commandBar = useMemo(
    () => buildCommandBar(base?.tabs ?? [], loadedDiffs[selectedKey] ?? null, currentDiff, location),
    [base, currentDiff, loadedDiffs, location, selectedKey],
  );
  const labels = useMemo(
    () => labelMap([...items(diffs[APPLICATION_KEY], "label"), ...items(currentDiff, "label")]),
    [currentDiff, diffs],
  );

  const idContext = useMemo<IdContext>(() => {
    const taken = barIds(buildCommandBar(base?.tabs ?? [], null, null, null).tabs);
    for (const node of [...(base?.commands ?? []), ...(base?.enableRules ?? []), ...(base?.displayRules ?? [])]) {
      const id = attr(node, "Id");
      if (id) taken.add(id);
    }
    return {
      prefix: data?.solution.publisherPrefix ?? "new",
      scope: selectedKey === APPLICATION_KEY ? "ApplicationRibbon" : selectedKey,
      taken,
    };
  }, [base, data, selectedKey]);

  // ── Status bar ───────────────────────────────────────────────────────────
  const uniqueName = data?.solution.uniqueName ?? (load.status === "loading" ? load.uniqueName : solutionName);
  const status = useMemo(() => {
    if (!connection) return "No environment selected";
    if (publish.phase === "running") return `Publishing ${uniqueName}: ${phaseText(publish.job)}`;
    if (load.status === "loading") return `Loading ${load.uniqueName}`;
    if (load.status === "error") return `Could not load ${load.uniqueName}`;
    if (data) {
      if (changes > 0) return `${data.solution.uniqueName}: ${plural(changes, "unsaved change")}`;
      return `${data.solution.uniqueName}: ${plural(data.entities.length, "table")}`;
    }
    return null;
  }, [changes, connection, data, load, publish, uniqueName]);

  // ── Banners ──────────────────────────────────────────────────────────────
  const addBanner = useCallback((banner: Banner) => {
    setBanners((current) => [...current.filter((item) => item.id !== banner.id), banner]);
  }, []);
  const dismissBanner = useCallback((id: string) => {
    setBanners((current) => current.filter((item) => item.id !== id));
  }, []);

  // ── Load ─────────────────────────────────────────────────────────────────
  const doLoad = useCallback(
    async (name: string) => {
      if (!connection || !name) return;
      loadAbort.current?.abort();
      const controller = new AbortController();
      loadAbort.current = controller;
      setConfirm(null);
      setLoad({ status: "loading", uniqueName: name });
      setSelection(null);
      setProblems(null);
      setBanners([]);
      try {
        const response = await loadSolution(connection, name, controller.signal);
        if (controller.signal.aborted) return;
        const nextDiffs: Record<string, RibbonNode> = {};
        for (const entity of response.entities) if (entity.diff) nextDiffs[entity.logicalName] = entity.diff;
        if (response.applicationRibbon.diff) nextDiffs[APPLICATION_KEY] = response.applicationRibbon.diff;
        queryClient.removeQueries({
          predicate: ({ queryKey }) => queryKey[0] === "ribbon-workbench" && queryKey[1] === connection && queryKey[2] === "base",
        });
        setLoadedDiffs(nextDiffs);
        setDiffs(nextDiffs);
        setCustomised(new Set());
        setSelectedKey(APPLICATION_KEY);
        setTab("commandBar");
        setLocations({});
        setTableQuery("");
        setLoad({ status: "ready", data: response });
        if (response.otherComponents.length > 0) {
          addBanner({
            id: "components",
            tone: "warn",
            text:
              `This solution also contains ${response.otherComponents
                .map((component) => `${component.count} ${component.name.toLowerCase()}`)
                .join(", ")}. ` +
              "Publishing imports them again too. A solution that contains only the tables to edit is faster and safer.",
          });
        }
        if (!response.canPublish && response.readOnlyReason) {
          addBanner({ id: "readonly", tone: "info", text: response.readOnlyReason });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoad({ status: "error", uniqueName: name, message: toRibbonError(error) });
      }
    },
    [addBanner, connection, queryClient],
  );

  const requestLoad = useCallback(() => {
    if (!solutionName) return;
    if (changes > 0 && data) {
      setConfirm({ kind: "reload" });
      return;
    }
    void doLoad(solutionName);
  }, [changes, data, doLoad, solutionName]);

  const clearSolution = useCallback((next: string) => {
    loadAbort.current?.abort();
    setSolutionName(next);
    setLoad({ status: "idle" });
    setLoadedDiffs({});
    setDiffs({});
    setSelection(null);
    setProblems(null);
    setBanners([]);
    setConfirm(null);
  }, []);

  const chooseSolution = useCallback(
    (next: string) => {
      if (next === solutionName) return;
      if (changes > 0) {
        setConfirm({ kind: "switch", next });
        return;
      }
      if (data || load.status !== "idle") clearSolution(next);
      else setSolutionName(next);
    },
    [changes, clearSolution, data, load.status, solutionName],
  );

  const confirmDiscard = useCallback(() => {
    const current = confirm;
    setConfirm(null);
    if (!current) return;
    if (current.kind === "discard") {
      setDiffs(loadedDiffs);
      setSelection(null);
      setProblems(null);
      setCustomised(new Set());
      dismissBanner("validation");
    } else if (current.kind === "switch") {
      clearSolution(current.next);
    } else {
      void doLoad(solutionName);
    }
  }, [clearSolution, confirm, dismissBanner, doLoad, loadedDiffs, solutionName]);

  // ── Tables and selection ─────────────────────────────────────────────────
  const selectTable = useCallback((key: string) => {
    setSelectedKey(key);
    setSelection(null);
  }, []);

  const setLocation = useCallback(
    (value: string) => setLocations((current) => ({ ...current, [selectedKey]: value })),
    [selectedKey],
  );

  // ── Edits ────────────────────────────────────────────────────────────────
  const editDiff = useCallback(
    (update: (diff: RibbonNode) => RibbonNode) => {
      if (!canEdit) return;
      setDiffs((current) => {
        const diff = current[selectedKey];
        if (!diff) return current;
        const next = update(diff);
        return next === diff ? current : { ...current, [selectedKey]: next };
      });
    },
    [canEdit, selectedKey],
  );

  const addChild = useCallback(
    (parent: BarNode, kind: AddKind) => {
      if (!currentDiff || !canEdit) return;
      const tab = tabOf(commandBar.tabs, parent.id);
      const template =
        base?.templates.find((item) => item.id === "Mscrm.Templates.Flexible2") ?? base?.templates[0] ?? null;
      const { diff, id } = addChildToDiff(currentDiff, parent, kind, idContext, {
        tabId: tab?.id ?? null,
        template: template?.id ?? null,
        layout: template?.layouts[0] ?? null,
      });
      if (!id) return;
      editDiff(() => diff);
      setTab("commandBar");
      setSelection({ kind: "control", id });
    },
    [base, canEdit, commandBar.tabs, currentDiff, editDiff, idContext],
  );

  const hideNode = useCallback((node: BarNode) => editDiff((diff) => hide(diff, node.id, idContext)), [editDiff, idContext]);
  const showNode = useCallback((id: string) => editDiff((diff) => show(diff, id)), [editDiff]);
  const deleteNode = useCallback(
    (node: BarNode) => {
      editDiff((diff) => deleteCustom(diff, node));
      setSelection((current) => (current?.id === node.id ? null : current));
    },
    [editDiff],
  );

  const customiseCommand = useCallback(
    (commandId: string) => {
      const command =
        base?.commands.find((item) => attr(item, "Id") === commandId) ??
        appBaseQuery.data?.commands.find((item) => attr(item, "Id") === commandId) ??
        null;
      if (!command) return;
      editDiff((diff) => customiseCommandInDiff(diff, command));
      setCustomised((current) => new Set(current).add(commandId));
      setTab("commands");
      setSelection({ kind: "command", id: commandId });
    },
    [appBaseQuery.data, base, editDiff],
  );

  const updateControl = useCallback(
    (id: string, control: RibbonNode) => {
      editDiff((diff) => updateControlInDiff(diff, id, control));
      const nextId = attr(control, "Id");
      if (nextId && nextId !== id) setSelection({ kind: "control", id: nextId });
    },
    [editDiff],
  );

  const setGroupLayout = useCallback(
    (groupId: string, layout: string) => {
      const tab = tabOf(commandBar.tabs, groupId);
      if (!tab) return;
      editDiff((diff) => setGroupLayoutInDiff(diff, groupId, tab.id, layout));
    },
    [commandBar.tabs, editDiff],
  );

  const updateItem = useCallback(
    (kind: Exclude<SelectionKind, "control">, previousId: string, node: RibbonNode) => {
      editDiff((diff) => replaceItem(diff, kind, previousId, node));
      const nextId = attr(node, "Id");
      if (nextId && nextId !== previousId) setSelection({ kind, id: nextId });
    },
    [editDiff],
  );

  const createItem = useCallback(
    (kind: Exclude<SelectionKind, "control">) => {
      if (!currentDiff || !canEdit) return;
      const id = newId(currentDiff, idContext, kind);
      const node = kind === "command" ? newCommand(id) : kind === "label" ? newLabel(id) : newRule(kind, id);
      editDiff((diff) => replaceItem(diff, kind, id, node));
      setTab(ITEM_TAB[kind]);
      setSelection({ kind, id });
    },
    [canEdit, currentDiff, editDiff, idContext],
  );

  const deleteItem = useCallback(
    (kind: ItemKind, id: string) => {
      editDiff((diff) => removeItem(diff, kind, id));
      setSelection((current) => (current?.id === id ? null : current));
    },
    [editDiff],
  );

  const requestDiscard = useCallback(() => setConfirm({ kind: "discard" }), []);

  // ── Validation and publish ───────────────────────────────────────────────
  const changedDiffs = useCallback(() => {
    const result: Record<string, RibbonNode> = {};
    for (const key of editedKeys) result[key] = diffs[key]!;
    return result;
  }, [diffs, editedKeys]);

  const runValidation = useCallback(async (): Promise<Problem[] | null> => {
    if (!connection || !data) return null;
    const changed = changedDiffs();
    if (Object.keys(changed).length === 0) {
      addBanner({ id: "validation", tone: "info", text: "There are no changes to check." });
      return [];
    }
    try {
      const response = await validateDiffs(connection, { solutionUniqueName: data.solution.uniqueName, diffs: changed });
      setProblems(response.problems);
      const errors = response.problems.filter((problem) => problem.severity === "error").length;
      addBanner({
        id: "validation",
        tone: errors > 0 ? "danger" : response.problems.length > 0 ? "warn" : "ok",
        text: response.problems.length === 0 ? "No problems found." : `${plural(response.problems.length, "problem")} found.`,
      });
      if (errors > 0) setTab("problems");
      return response.problems;
    } catch (error) {
      addBanner({ id: "validation", tone: "danger", text: toRibbonError(error) });
      return null;
    }
  }, [addBanner, changedDiffs, connection, data]);

  const validate = useCallback(() => void runValidation(), [runValidation]);

  const requestPublish = useCallback(async () => {
    if (changes === 0 || publishing) return;
    setPublish({ phase: "checking" });
    const found = await runValidation();
    if (found === null || found.some((problem) => problem.severity === "error")) {
      setPublish({ phase: "idle" });
      return;
    }
    setPublish({ phase: "confirm" });
  }, [changes, publishing, runValidation]);

  const cancelPublish = useCallback(() => setPublish({ phase: "idle" }), []);

  const confirmPublish = useCallback(async () => {
    if (!connection || !data) return;
    const changed = changedDiffs();
    const baseHashes: Record<string, string> = {};
    for (const key of Object.keys(changed)) {
      const hash =
        key === APPLICATION_KEY
          ? data.applicationRibbon.diffHash
          : data.entities.find((entity) => entity.logicalName === key)?.diffHash;
      if (hash) baseHashes[key] = hash;
    }
    setPublish({ phase: "running", jobId: null, job: null });
    for (const id of ["publish", "validation"]) dismissBanner(id);
    try {
      const started = await startPublish(connection, {
        solutionUniqueName: data.solution.uniqueName,
        diffs: changed,
        baseHashes,
      });
      setPublish((current) => (current.phase === "running" ? { ...current, jobId: started.jobId } : current));
    } catch (error) {
      setPublish({ phase: "idle" });
      const rejected = rejectedProblems(error);
      if (rejected) {
        setProblems(rejected);
        setTab("problems");
      }
      addBanner({ id: "publish", tone: "danger", text: toRibbonError(error) });
    }
  }, [addBanner, changedDiffs, connection, data, dismissBanner]);

  const finish = useCallback(
    (job: PublishJob) => {
      setPublish({ phase: "idle" });
      const name = data?.solution.uniqueName ?? solutionName;
      switch (job.status) {
        case "succeeded":
          showToast(`Published ${name}.`, "success");
          void doLoad(name).then(() => {
            if (job.warnings.length > 0) {
              addBanner({ id: "publish", tone: "warn", text: "Published with warnings.", details: job.warnings });
            }
          });
          return;
        case "publishFailed":
          addBanner({
            id: "publish",
            tone: "danger",
            text: job.message ?? "The changes were imported but not published.",
            details: job.errors,
            action: "publishAgain",
          });
          return;
        case "timedOut":
          addBanner({ id: "publish", tone: "warn", text: job.message ?? "The import is still running in Dataverse." });
          return;
        case "conflict":
          addBanner({ id: "publish", tone: "danger", text: job.message ?? "The solution changed in Dataverse.", action: "reload" });
          return;
        default:
          addBanner({
            id: "publish",
            tone: "danger",
            title: "The solution could not be imported.",
            text: job.errors.length > 0 ? "Reasons:" : "Dataverse did not give a reason.",
            details: [...job.errors, ...job.warnings],
          });
      }
    },
    [addBanner, data, doLoad, showToast, solutionName],
  );

  const publishTargets = useRef<PublishJob["targets"] | null>(null);
  const runningJobId = publish.phase === "running" ? publish.jobId : null;
  useEffect(() => {
    if (!connection || !runningJobId) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const job = await fetchPublishJob(connection, runningJobId);
          if (cancelled) return;
          if (job.status === "queued" || job.status === "running") {
            setPublish((current) => (current.phase === "running" ? { ...current, job } : current));
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
            continue;
          }
          publishTargets.current = job.targets;
          finish(job);
          return;
        } catch (error) {
          if (cancelled) return;
          setPublish({ phase: "idle" });
          addBanner({ id: "publish", tone: "danger", text: toRibbonError(error) });
          return;
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [addBanner, connection, finish, runningJobId]);

  const [publishingAgain, setPublishingAgain] = useState(false);
  const publishAgain = useCallback(async () => {
    if (!connection || !publishTargets.current) return;
    setPublishingAgain(true);
    try {
      await requestPublishAgain(connection, publishTargets.current);
      dismissBanner("publish");
      const name = data?.solution.uniqueName ?? solutionName;
      showToast(`Published ${name}.`, "success");
      void doLoad(name);
    } catch (error) {
      addBanner({
        id: "publish",
        tone: "danger",
        text: "The changes were imported but not published.",
        details: [toRibbonError(error)],
        action: "publishAgain",
      });
    } finally {
      setPublishingAgain(false);
    }
  }, [addBanner, connection, data, dismissBanner, doLoad, showToast, solutionName]);

  const reloadAfterConflict = useCallback(() => {
    if (solutionName) void doLoad(solutionName);
  }, [doLoad, solutionName]);

  // ── Problems ─────────────────────────────────────────────────────────────
  const selectProblem = useCallback(
    (problem: Problem) => {
      setSelectedKey(problem.table);
      const id = problem.item;
      if (!id) {
        setSelection(null);
        return;
      }
      const diff = diffs[problem.table];
      const kinds: Exclude<SelectionKind, "control">[] = ["command", "enableRule", "displayRule", "label"];
      const kind = kinds.find((candidate) => findItem(diff, candidate, id));
      if (kind) {
        setTab(ITEM_TAB[kind]);
        setSelection({ kind, id });
      } else {
        setTab("commandBar");
        setSelection({ kind: "control", id });
      }
    },
    [diffs],
  );

  const selectedNode = selection?.kind === "control" ? findBarNode(commandBar.tabs, selection.id) : null;

  return {
    connectionId: connection,
    status,
    solutions,
    solutionsLoading: solutionsQuery.isFetching && !solutionsQuery.data,
    solutionsError: solutionsQuery.isError && !solutionsQuery.data ? toRibbonError(solutionsQuery.error) : null,
    retrySolutions: () => void solutionsQuery.refetch(),
    solutionName,
    chooseSolution,
    load,
    data,
    requestLoad,
    retryLoad: () => void doLoad(load.status === "error" ? load.uniqueName : solutionName),
    tables,
    tableQuery,
    setTableQuery,
    selectedKey,
    selectedTable,
    selectTable,
    editedKeys,
    changes,
    tab,
    setTab,
    selection,
    setSelection,
    selectedNode,
    base,
    baseLoading: baseQuery.isFetching && !baseQuery.data,
    baseError: baseQuery.isError && !baseQuery.data ? toRibbonError(baseQuery.error) : null,
    retryBase: () => void baseQuery.refetch(),
    appBase: appBaseQuery.data ?? null,
    loadedDiff: loadedDiffs[selectedKey] ?? null,
    currentDiff,
    diffs,
    labels,
    commandBar,
    location,
    locationOptions,
    setLocation,
    canEdit,
    readOnlyReason: selectedReadOnly,
    customised,
    addChild,
    hideNode,
    showNode,
    deleteNode,
    customiseCommand,
    updateControl,
    setGroupLayout,
    updateItem,
    createItem,
    deleteItem,
    problems,
    selectProblem,
    validate,
    banners,
    dismissBanner,
    publish,
    publishing,
    requestPublish: () => void requestPublish(),
    cancelPublish,
    confirmPublish: () => void confirmPublish(),
    publishAgain: () => void publishAgain(),
    publishingAgain,
    reloadAfterConflict,
    confirm,
    setConfirm,
    requestDiscard,
    confirmDiscard,
  };
}

export type RibbonWorkbenchState = ReturnType<typeof useRibbonWorkbench>;
