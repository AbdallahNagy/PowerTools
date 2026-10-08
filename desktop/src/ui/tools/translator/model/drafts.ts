import {
  GLOBAL_SCOPE,
  cellId,
  isName,
  labelName,
  rowId,
  scopeOf,
  tabOf,
  type ComponentTab,
} from "./labels";
import type { ApplyJob, ApplyRow, LabelKey, LabelRow } from "./types";

export const BASE_REQUIRED_MESSAGE = "The base language label is required.";
/**
 * The Dataverse review left the effect of an empty label under MergeLabels unverified,
 * so clearing a translation is not offered in this version.
 */
export const CLEAR_NOT_SUPPORTED_MESSAGE =
  "Removing a translation is not supported yet. Enter a value or restore the original text.";

/** One edited cell: a row key and one language. */
export interface Draft {
  id: string;
  rowId: string;
  key: LabelKey;
  lcid: number;
  value: string;
  original: string;
  scope: string;
  tab: ComponentTab;
  component: string;
  labelName: string;
  /** The error from the last apply, when this cell failed. */
  error?: string | null;
}

export type Drafts = ReadonlyMap<string, Draft>;

export const NO_DRAFTS: Drafts = new Map();

export function originalValue(row: LabelRow, lcid: number): string {
  return row.labels[String(lcid)] ?? "";
}

/** Sets a cell's text. Restoring the original text removes the draft. */
export function setDraft(drafts: Drafts, row: LabelRow, lcid: number, value: string): Drafts {
  const id = rowId(row.key);
  const key = cellId(id, lcid);
  const original = originalValue(row, lcid);
  const next = new Map(drafts);
  if (value === original) {
    next.delete(key);
    return next;
  }

  next.set(key, {
    id: key,
    rowId: id,
    key: row.key,
    lcid,
    value,
    original,
    scope: scopeOf(row.key),
    tab: tabOf(row.key),
    component: row.component,
    labelName: labelName(row),
    error: null,
  });
  return next;
}

/** Why a draft cannot be applied, or null. */
export function draftProblem(draft: Pick<Draft, "value" | "lcid" | "key">, baseLcid: number): string | null {
  if (draft.value.trim()) return null;
  return draft.lcid === baseLcid && isName(draft.key.property)
    ? BASE_REQUIRED_MESSAGE
    : CLEAR_NOT_SUPPORTED_MESSAGE;
}

export function invalidCount(drafts: Drafts, baseLcid: number): number {
  let count = 0;
  for (const draft of drafts.values()) if (draftProblem(draft, baseLcid)) count++;
  return count;
}

export function countWhere(drafts: Drafts, predicate: (draft: Draft) => boolean): number {
  let count = 0;
  for (const draft of drafts.values()) if (predicate(draft)) count++;
  return count;
}

/** Groups drafts into one apply row per label key. */
export function toApplyRows(drafts: Drafts): ApplyRow[] {
  const rows = new Map<string, ApplyRow>();
  for (const draft of drafts.values()) {
    const row = rows.get(draft.rowId) ?? { key: draft.key, labels: {} };
    row.labels[draft.lcid] = draft.value;
    rows.set(draft.rowId, row);
  }
  return [...rows.values()];
}

export interface ScopeSummary {
  scope: string;
  title: string;
  count: number;
}

/** One line per table or Global choices, for the apply confirmation. */
export function summarizeByScope(drafts: Drafts): ScopeSummary[] {
  const byScope = new Map<string, number>();
  for (const draft of drafts.values()) byScope.set(draft.scope, (byScope.get(draft.scope) ?? 0) + 1);
  return [...byScope.entries()]
    .map(([scope, count]) => ({ scope, count, title: scope === GLOBAL_SCOPE ? "Global choices" : scope }))
    .sort((left, right) => {
      if (left.scope === GLOBAL_SCOPE) return 1;
      if (right.scope === GLOBAL_SCOPE) return -1;
      return left.title.localeCompare(right.title);
    });
}

export interface AppliedOutcome {
  /** Drafts left after the apply: the failed and skipped cells, with their error. */
  drafts: Drafts;
  /** Cells that were written. */
  succeeded: Draft[];
  /** Cells that were not written. */
  failed: Draft[];
}

/**
 * Applies a finished job to the drafts that were sent. Cells the job has no result for
 * (for example when the job stopped) stay as drafts with the job's last error.
 */
export function applyJobResults(current: Drafts, sent: readonly Draft[], job: ApplyJob): AppliedOutcome {
  const outcomes = new Map<string, { outcome: string; message: string | null }>();
  for (const result of job.results) {
    const id = rowId(result.key);
    for (const lcid of result.lcids) outcomes.set(cellId(id, lcid), result);
  }

  const lastError =
    [...job.log].reverse().find((entry) => entry.level === "error")?.message ?? "This label was not applied.";
  const next = new Map(current);
  const succeeded: Draft[] = [];
  const failed: Draft[] = [];
  for (const draft of sent) {
    const result = outcomes.get(draft.id);
    const live = next.get(draft.id);
    if (result?.outcome === "succeeded") {
      succeeded.push(draft);
      // Remove only if the user has not changed the cell again.
      if (live && live.value === draft.value) next.delete(draft.id);
      continue;
    }

    const message =
      result?.outcome === "skipped"
        ? `Skipped: ${result.message ?? "the component no longer exists."}`
        : (result?.message ?? lastError);
    const failedDraft = { ...draft, error: message };
    failed.push(failedDraft);
    if (live && live.value === draft.value) next.set(draft.id, { ...live, error: message });
  }

  return { drafts: next, succeeded, failed };
}

/** Writes saved values into loaded rows so the grid shows them without a reload. */
export function patchRows(rows: readonly LabelRow[], saved: readonly Draft[]): LabelRow[] {
  if (saved.length === 0) return [...rows];
  const byRow = new Map<string, Draft[]>();
  for (const draft of saved) byRow.set(draft.rowId, [...(byRow.get(draft.rowId) ?? []), draft]);
  return rows.map((row) => {
    const changes = byRow.get(rowId(row.key));
    if (!changes) return row;
    const labels = { ...row.labels };
    for (const change of changes) labels[String(change.lcid)] = change.value;
    return { ...row, labels };
  });
}
