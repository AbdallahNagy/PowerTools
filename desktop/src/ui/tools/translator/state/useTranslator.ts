import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTabConnection } from "../../../shared/connections";
import { useToast } from "../../../shared/ui";
import { fetchApplyJob, publishAgain, startApply, useLabels, useLanguages, useTables } from "../api/translatorApi";
import { translatorKeys } from "../api/queryKeys";
import { toTranslatorError } from "../model/apiError";
import {
  NO_DRAFTS,
  applyJobResults,
  invalidCount,
  patchRows,
  setDraft,
  toApplyRows,
  type Draft,
  type Drafts,
} from "../model/drafts";
import {
  DEFAULT_SORT,
  componentCount,
  filterByQuery,
  filterByShow,
  nextSort,
  sortRows,
  type ShowFilter,
  type SortState,
} from "../model/grid";
import {
  GLOBAL_SCOPE,
  orderLanguages,
  plural,
  tabDefinition,
  type ComponentTab,
} from "../model/labels";
import type { ApplyJob, LabelQueryResponse, LabelRow, PublishResult } from "../model/types";

const POLL_MS = 250;

export type ApplyState =
  | { phase: "closed" }
  | { phase: "confirm"; error: string | null }
  | { phase: "running"; jobId: string | null; sent: Draft[]; job: ApplyJob | null }
  | {
      phase: "result";
      job: ApplyJob;
      failed: Draft[];
      publish: PublishResult;
      publishing: boolean;
    };

export type ConfirmKind = "discard" | "reload" | null;

/** Scope, tabs, filters, drafts, and the apply flow for one Translator tab. */
export function useTranslator() {
  const { connectionName } = useTabConnection();
  const connection = connectionName || null;
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<string | null>(null);
  const [tab, setTab] = useState<ComponentTab>("table");
  const [tableQuery, setTableQuery] = useState("");
  const [gridQuery, setGridQuery] = useState("");
  const [show, setShow] = useState<ShowFilter>("both");
  const [hiddenLcids, setHiddenLcids] = useState<ReadonlySet<number>>(() => new Set());
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [apply, setApply] = useState<ApplyState>({ phase: "closed" });
  const [discarded, setDiscarded] = useState(0);

  // Reset during render, not in an effect, so the new environment never renders
  // (or queries) with the previous environment's scope or drafts.
  const [stateConnection, setStateConnection] = useState(connection);
  if (stateConnection !== connection) {
    setStateConnection(connection);
    if (drafts.size > 0) setDiscarded(drafts.size);
    setScope(null);
    setTab("table");
    setTableQuery("");
    setGridQuery("");
    setShow("both");
    setHiddenLcids(new Set());
    setSort(DEFAULT_SORT);
    setDrafts(NO_DRAFTS);
    setLanguagesOpen(false);
    setConfirm(null);
    setApply({ phase: "closed" });
  }

  useEffect(() => {
    if (discarded === 0) return;
    showToast(
      `Discarded ${plural(discarded, "unsaved label change")} from the previous environment.`,
      "info",
    );
    setDiscarded(0);
  }, [discarded, showToast]);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const languagesQuery = useLanguages(connection);
  const tablesQuery = useTables(connection);
  const baseLcid = languagesQuery.data?.baseLcid ?? 0;
  const languages = useMemo(
    () => orderLanguages(languagesQuery.data?.languages ?? [], baseLcid),
    [baseLcid, languagesQuery.data],
  );
  const allLcids = useMemo(
    () => languages.map((language) => language.lcid).sort((left, right) => left - right),
    [languages],
  );
  const visibleLanguages = useMemo(
    () => languages.filter((language) => language.lcid === baseLcid || !hiddenLcids.has(language.lcid)),
    [baseLcid, hiddenLcids, languages],
  );
  const visibleLcids = useMemo(() => visibleLanguages.map((language) => language.lcid), [visibleLanguages]);
  const tables = useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);

  const activeTab: ComponentTab = scope === GLOBAL_SCOPE ? "global" : tab;
  const labelsQuery = useLabels(connection, scope, activeTab, allLcids);
  const globalQuery = useLabels(connection, GLOBAL_SCOPE, "global", allLcids);
  const rows = useMemo(() => labelsQuery.data?.rows ?? [], [labelsQuery.data]);
  const visibleRows = useMemo(
    () => sortRows(filterByQuery(filterByShow(rows, show), gridQuery, visibleLcids), sort),
    [gridQuery, rows, show, sort, visibleLcids],
  );
  const globalCount = useMemo(
    () =>
      globalQuery.data
        ? new Set(globalQuery.data.rows.map((row) => row.key.optionSet)).size
        : null,
    [globalQuery.data],
  );

  useEffect(() => {
    if (languagesQuery.isError) showToast(toTranslatorError(languagesQuery.error), "error");
  }, [languagesQuery.error, languagesQuery.isError, showToast]);
  useEffect(() => {
    if (tablesQuery.isError) showToast(toTranslatorError(tablesQuery.error), "error");
  }, [tablesQuery.error, tablesQuery.isError, showToast]);
  useEffect(() => {
    if (labelsQuery.isError) showToast(toTranslatorError(labelsQuery.error), "error");
  }, [labelsQuery.error, labelsQuery.isError, showToast]);

  const firstLoading =
    !!connection &&
    ((languagesQuery.isFetching && !languagesQuery.data) || (tablesQuery.isFetching && !tablesQuery.data));
  const firstError =
    (languagesQuery.isError && !languagesQuery.data) || (tablesQuery.isError && !tablesQuery.data)
      ? toTranslatorError(languagesQuery.error ?? tablesQuery.error)
      : null;
  const gridLoading = !!scope && labelsQuery.isFetching && !labelsQuery.data;
  const gridError = labelsQuery.isError && !labelsQuery.data ? toTranslatorError(labelsQuery.error) : null;

  const draftsByScope = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of drafts.values()) counts.set(draft.scope, (counts.get(draft.scope) ?? 0) + 1);
    return counts;
  }, [drafts]);
  const draftsByTab = useMemo(() => {
    const counts = new Map<ComponentTab, number>();
    for (const draft of drafts.values()) {
      if (draft.scope === scope) counts.set(draft.tab, (counts.get(draft.tab) ?? 0) + 1);
    }
    return counts;
  }, [drafts, scope]);
  const invalid = useMemo(() => invalidCount(drafts, baseLcid), [baseLcid, drafts]);

  const scopeTitle = scope === GLOBAL_SCOPE ? "Global choices" : scope;
  const definition = tabDefinition(activeTab);

  const status = useMemo(() => {
    if (!connection) return "No environment selected";
    if (apply.phase === "running") {
      if (apply.job?.phase === "publishing") return "Publishing…";
      const total = apply.job?.total ?? apply.sent.length;
      return `Updating labels: ${apply.job?.processed ?? 0} of ${total}`;
    }
    if (firstLoading) return "Loading languages and tables…";
    if (firstError) return "Could not load languages and tables";
    if (drafts.size > 0) return plural(drafts.size, "unsaved change");
    if (scope) {
      if (gridLoading) return `Loading ${definition.noun} for ${scopeTitle}…`;
      if (gridError) return `Could not load ${definition.noun} for ${scopeTitle}`;
      if (labelsQuery.data) {
        return activeTab === "table"
          ? `${scopeTitle}: ${plural(rows.length, "label")}`
          : `${scopeTitle}: ${componentCount(rows)} ${definition.countNoun}`;
      }
    }
    return `${plural(tables.length, "table")}, ${plural(languages.length, "language")}`;
  }, [
    activeTab,
    apply,
    connection,
    definition,
    drafts.size,
    firstError,
    firstLoading,
    gridError,
    gridLoading,
    labelsQuery.data,
    languages.length,
    rows,
    scope,
    scopeTitle,
    tables.length,
  ]);

  const selectScope = useCallback(
    (next: string) => {
      if (next === scope) return;
      setScope(next);
      setGridQuery("");
    },
    [scope],
  );

  const editCell = useCallback((row: LabelRow, lcid: number, value: string) => {
    setDrafts((current) => setDraft(current, row, lcid, value));
  }, []);

  const toggleSort = useCallback((key: string) => setSort((current) => nextSort(current, key)), []);

  const toggleLanguage = useCallback((lcid: number, visible: boolean) => {
    setHiddenLcids((current) => {
      const next = new Set(current);
      if (visible) next.delete(lcid);
      else next.add(lcid);
      return next;
    });
  }, []);
  const showAllLanguages = useCallback(() => setHiddenLcids(new Set()), []);
  const showBaseOnly = useCallback(
    () => setHiddenLcids(new Set(allLcids.filter((lcid) => lcid !== baseLcid))),
    [allLcids, baseLcid],
  );

  const reload = useCallback(async () => {
    if (!connection) return;
    setConfirm(null);
    setDrafts(NO_DRAFTS);
    await queryClient.resetQueries({ queryKey: ["translator", connection] });
  }, [connection, queryClient]);

  const requestReload = useCallback(() => {
    if (draftsRef.current.size > 0) setConfirm("reload");
    else void reload();
  }, [reload]);

  const requestDiscard = useCallback(() => setConfirm("discard"), []);
  const confirmDiscard = useCallback(() => {
    setDrafts(NO_DRAFTS);
    setConfirm(null);
  }, []);

  // ── Apply ────────────────────────────────────────────────────────────────

  const openApply = useCallback(() => setApply({ phase: "confirm", error: null }), []);
  const closeApply = useCallback(() => {
    setApply((current) => (current.phase === "running" ? current : { phase: "closed" }));
  }, []);

  const confirmApply = useCallback(async () => {
    if (!connection) return;
    const sent = [...draftsRef.current.values()];
    if (sent.length === 0) return;
    setApply({ phase: "running", jobId: null, sent, job: null });
    try {
      const started = await startApply(connection, { rows: toApplyRows(draftsRef.current) });
      setApply((current) => (current.phase === "running" ? { ...current, jobId: started.jobId } : current));
    } catch (error) {
      const message = toTranslatorError(error);
      showToast(message, "error");
      setApply({ phase: "confirm", error: message });
    }
  }, [connection, showToast]);

  const finish = useCallback(
    (job: ApplyJob, sent: Draft[]) => {
      const outcome = applyJobResults(draftsRef.current, sent, job);
      setDrafts(outcome.drafts);

      if (connection) {
        const byQuery = new Map<string, Draft[]>();
        for (const draft of outcome.succeeded) {
          const key = `${draft.scope}\u0000${draft.tab}`;
          byQuery.set(key, [...(byQuery.get(key) ?? []), draft]);
        }
        for (const [key, saved] of byQuery) {
          const [savedScope, savedTab] = key.split("\u0000") as [string, ComponentTab];
          queryClient.setQueryData<LabelQueryResponse>(
            translatorKeys.labels(connection, savedScope, savedTab, allLcids),
            (old) => (old ? { rows: patchRows(old.rows, saved) } : old),
          );
        }
      }

      const published = job.publish.status === "succeeded" || job.publish.status === "notNeeded";
      if (outcome.failed.length === 0 && job.status === "completed" && published) {
        setApply({ phase: "closed" });
        showToast(
          `Updated ${plural(outcome.succeeded.length, "label")} and published ${plural(
            job.publish.targets.tables.length + job.publish.targets.optionSets.length,
            "component",
          )}.`,
          "success",
        );
        return;
      }

      setApply({ phase: "result", job, failed: outcome.failed, publish: job.publish, publishing: false });
    },
    [allLcids, connection, queryClient, showToast],
  );

  const runningJobId = apply.phase === "running" ? apply.jobId : null;
  const runningSent = apply.phase === "running" ? apply.sent : null;
  useEffect(() => {
    if (!connection || !runningJobId || !runningSent) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const job = await fetchApplyJob(connection, runningJobId);
          if (cancelled) return;
          if (job.status === "queued" || job.status === "running") {
            setApply((current) => (current.phase === "running" ? { ...current, job } : current));
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
            continue;
          }
          finish(job, runningSent);
          return;
        } catch (error) {
          if (cancelled) return;
          const message = toTranslatorError(error);
          showToast(message, "error");
          setApply({ phase: "confirm", error: message });
          return;
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [connection, finish, runningJobId, runningSent, showToast]);

  const retryPublish = useCallback(async () => {
    if (!connection || apply.phase !== "result") return;
    const { targets } = apply.publish;
    const failedCount = apply.failed.length;
    setApply((current) => (current.phase === "result" ? { ...current, publishing: true } : current));
    try {
      const response = await publishAgain(connection, targets);
      if (failedCount === 0) {
        setApply({ phase: "closed" });
        showToast(`Published ${plural(response.count, "component")}.`, "success");
        return;
      }
      setApply((current) =>
        current.phase === "result"
          ? { ...current, publishing: false, publish: { ...current.publish, status: "succeeded", message: null } }
          : current,
      );
      showToast(`Published ${plural(response.count, "component")}.`, "success");
    } catch (error) {
      const message = toTranslatorError(error);
      showToast(message, "error");
      setApply((current) =>
        current.phase === "result"
          ? { ...current, publishing: false, publish: { ...current.publish, status: "failed", message } }
          : current,
      );
    }
  }, [apply, connection, showToast]);

  return {
    connectionName: connection,
    status,
    languages,
    visibleLanguages,
    baseLcid,
    tables,
    tableQuery,
    setTableQuery,
    globalCount,
    firstLoading,
    firstError,
    retryFirstLoad: () => {
      void languagesQuery.refetch();
      void tablesQuery.refetch();
    },
    scope,
    selectScope,
    tab,
    setTab,
    activeTab,
    rows,
    visibleRows,
    gridLoading,
    gridError,
    retryGrid: () => void labelsQuery.refetch(),
    gridQuery,
    setGridQuery,
    show,
    setShow,
    sort,
    toggleSort,
    drafts,
    draftsByScope,
    draftsByTab,
    invalid,
    editCell,
    languagesOpen,
    setLanguagesOpen,
    toggleLanguage,
    showAllLanguages,
    showBaseOnly,
    confirm,
    setConfirm,
    requestReload,
    reload,
    requestDiscard,
    confirmDiscard,
    apply,
    openApply,
    closeApply,
    confirmApply,
    retryPublish,
    editedCount: drafts.size,
  };
}

export type TranslatorState = ReturnType<typeof useTranslator>;
