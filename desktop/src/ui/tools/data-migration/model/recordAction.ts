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
