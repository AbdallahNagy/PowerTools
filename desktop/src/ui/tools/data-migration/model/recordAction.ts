import type { MigrationJobStatus, RunMigrationArgs } from "../api/useMigrationJob";

type MigrationMode = RunMigrationArgs["mode"];

/** What the migration does with one record in the chosen target. */
export type RecordAction = "create" | "update";

export interface PlannedAction {
  /** Null when it depends on a target that is not chosen yet. */
  action: RecordAction | null;
  /** Why the request will fail in the target, if it will. */
  problem: string | null;
}

export function plannedAction(mode: MigrationMode, existsInTarget: boolean | null): PlannedAction {
  if (mode === "create") {
    return {
      action: "create",
      problem: existsInTarget ? "Already exists in the target, so create will fail." : null,
    };
  }
  if (mode === "update") {
    return {
      action: "update",
      problem: existsInTarget === false ? "Not in the target, so update will fail." : null,
    };
  }
  if (existsInTarget === null) return { action: null, problem: null };
  return { action: existsInTarget ? "update" : "create", problem: null };
}

/** "3 created · 2 updated" for the status bar and run banner. */
export function createdUpdatedSummary(job: Pick<MigrationJobStatus, "created" | "updated">): string {
  return `${job.created} created · ${job.updated} updated`;
}

/**
 * What the migration does with all matching records in the target, such as
 * "3 to create · 2 to update". Null until the target has been checked.
 */
export function totalActionsSummary(
  mode: MigrationMode,
  count: number,
  existing: number | null,
): string | null {
  if (existing === null) return null;
  const missing = (count - existing).toLocaleString();
  const inTarget = existing.toLocaleString();
  if (mode === "create") {
    return existing > 0
      ? `${missing} to create · ${inTarget} already in the target, so create will fail`
      : `${missing} to create`;
  }
  if (mode === "update") {
    return count > existing
      ? `${inTarget} to update · ${missing} not in the target, so update will fail`
      : `${inTarget} to update`;
  }
  return `${missing} to create · ${inTarget} to update`;
}
