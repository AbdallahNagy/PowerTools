import type { EnvironmentVariable, SaveValueItem, SaveValueResult } from "./types";
import { valueReadOnlyReason } from "./types";
import { validateValue } from "./valueValidation";

export type SortKey = "displayName" | "schemaName" | "type" | "currentValue";
export interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}
export const DEFAULT_SORT: SortState = { key: "displayName", direction: "asc" };
export const SORTABLE_KEYS: readonly SortKey[] = ["displayName", "schemaName", "type", "currentValue"];

/** Unsaved value edits, keyed by definition id. */
export type Drafts = Readonly<Record<string, string>>;

/** The last save result per definition id. `Saved` clears on the next edit or refresh. */
export type SaveResults = Readonly<Record<string, { ok: boolean; error: string | null }>>;

export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function displayName(variable: EnvironmentVariable): string {
  return variable.displayName || variable.schemaName;
}

/** The stored current value, or empty when the variable has no value row. */
export function storedValue(variable: EnvironmentVariable): string {
  return variable.currentValue ?? "";
}

/** What the variable resolves to: its current value, or the default when there is none. */
function effectiveValue(variable: EnvironmentVariable): string {
  return variable.valueId !== null ? storedValue(variable) : (variable.defaultValue ?? "");
}

export function filterVariables(variables: readonly EnvironmentVariable[], search: string): EnvironmentVariable[] {
  const text = search.trim().toLowerCase();
  if (!text) return [...variables];
  return variables.filter((variable) =>
    [variable.displayName ?? "", variable.schemaName, effectiveValue(variable)].some((field) =>
      field.toLowerCase().includes(text),
    ),
  );
}

function sortValue(variable: EnvironmentVariable, key: SortKey): string {
  switch (key) {
    case "displayName":
      return displayName(variable);
    case "schemaName":
      return variable.schemaName;
    case "type":
      return variable.typeLabel;
    case "currentValue":
      return effectiveValue(variable);
  }
}

export function sortVariables(variables: readonly EnvironmentVariable[], sort: SortState): EnvironmentVariable[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...variables].sort(
    (a, b) =>
      factor * sortValue(a, sort.key).localeCompare(sortValue(b, sort.key), undefined, { sensitivity: "base" }) ||
      a.definitionId.localeCompare(b.definitionId),
  );
}

export function isDirty(variable: EnvironmentVariable, drafts: Drafts): boolean {
  const draft = drafts[variable.definitionId];
  return draft !== undefined && draft !== storedValue(variable);
}

export function draftError(variable: EnvironmentVariable, drafts: Drafts): string | null {
  if (!isDirty(variable, drafts)) return null;
  return validateValue(variable.type, drafts[variable.definitionId] ?? "", true);
}

export function pendingEdits(variables: readonly EnvironmentVariable[], drafts: Drafts): SaveValueItem[] {
  return variables
    .filter((variable) => isDirty(variable, drafts))
    .map((variable) => ({
      definitionId: variable.definitionId,
      valueId: variable.valueId,
      value: drafts[variable.definitionId] ?? "",
    }));
}

export function invalidCount(variables: readonly EnvironmentVariable[], drafts: Drafts): number {
  return variables.filter((variable) => draftError(variable, drafts) !== null).length;
}

/**
 * Keeps edits for rows that still exist and can be edited after a reload, and drops edits
 * that now match the stored value.
 */
export function reconcileDrafts(variables: readonly EnvironmentVariable[], drafts: Drafts): Drafts {
  const byId = new Map(variables.map((variable) => [variable.definitionId, variable]));
  const next: Record<string, string> = {};
  for (const [id, value] of Object.entries(drafts)) {
    const variable = byId.get(id);
    if (!variable || valueReadOnlyReason(variable) !== null) continue;
    if (value !== storedValue(variable)) next[id] = value;
  }
  return next;
}

export function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** Applies successful save results to the cached list. */
export function applySaved(
  variables: readonly EnvironmentVariable[],
  saved: ReadonlyMap<string, { valueId: string | null; value: string }>,
): EnvironmentVariable[] {
  return variables.map((variable) => {
    const result = saved.get(variable.definitionId);
    return result ? { ...variable, valueId: result.valueId, currentValue: result.value } : variable;
  });
}

export function statusText(input: {
  total: number;
  shown: number;
  filtered: boolean;
  unsaved: number;
  saving: { done: number; total: number } | null;
}): string {
  if (input.saving) return `Saving ${input.saving.done} of ${input.saving.total}…`;
  const noun = input.total === 1 ? "variable" : "variables";
  const count = input.filtered ? `${input.shown} of ${input.total} ${noun}` : `${input.total} ${noun}`;
  return input.unsaved > 0 ? `${count} · ${input.unsaved} unsaved` : count;
}

export function saveToast(results: readonly SaveValueResult[]): { message: string; type: "success" | "error" } {
  const failed = results.filter((result) => !result.ok).length;
  if (failed === 0) {
    const noun = results.length === 1 ? "value" : "values";
    return {
      message: `${results.length} ${noun} saved. Apps and flows can take up to an hour to pick up the change.`,
      type: "success",
    };
  }
  return {
    message: `${failed} of ${results.length} values failed. Select a failed row to see why.`,
    type: "error",
  };
}
