import type { MigrationJobStatus, RunMigrationArgs } from "../api/useMigrationJob";

/** The settings one migration run repeats for every target. */
export type MigrationSettings = Omit<RunMigrationArgs, "targetConnectionId" | "confirmedDeleteCount">;

export type TargetState = "pending" | "running" | "succeeded" | "partial" | "failed";

export function isJobActive(job: MigrationJobStatus | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/** Results count only for the exact settings they ran with. Any change starts a new run. */
export function settingsKey(settings: MigrationSettings): string {
  return JSON.stringify([
    settings.sourceConnectionId,
    settings.entityLogicalName,
    settings.attributes,
    settings.fetchXmlFilter ?? "",
    settings.create,
    settings.update,
    settings.delete,
  ]);
}

export function targetState(result: MigrationJobStatus | undefined, running: boolean): TargetState {
  if (running) return "running";
  if (!result) return "pending";
  if (result.status === "failed") return "failed";
  return result.failed > 0 ? "partial" : "succeeded";
}

/** First target, in the user's order, that has not been migrated with these settings. */
export function nextTarget(
  targetIds: string[],
  results: Record<string, MigrationJobStatus>,
  runningTargetId: string | null,
): string | null {
  return targetIds.find((id) => !results[id] && id !== runningTargetId) ?? null;
}

export const targetStateLabels: Record<TargetState, string> = {
  pending: "Not migrated",
  running: "Migrating",
  succeeded: "Migrated",
  partial: "Migrated with errors",
  failed: "Failed",
};
