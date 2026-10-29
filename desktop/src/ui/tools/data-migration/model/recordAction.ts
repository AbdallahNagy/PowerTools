import type { MigrationJobStatus, RunMigrationArgs } from "../api/useMigrationJob";

export type MigrationOptions = Pick<RunMigrationArgs, "create" | "update" | "delete">;

/** What the migration does with one source record in the chosen target. */
export type RecordAction = "create" | "update" | "skip";

/**
 * Records are matched by id. Existing records are updated and missing ones
 * created; a record the options do not cover is skipped, as in Data Transporter.
 * Null when it depends on a target that is not chosen yet.
 */
export function plannedAction(options: MigrationOptions, existsInTarget: boolean | null): RecordAction | null {
  if (existsInTarget === null) {
    if (options.create && !options.update) return "create";
    if (options.update && !options.create) return "update";
    return options.create || options.update ? null : "skip";
  }
  if (existsInTarget) return options.update ? "update" : "skip";
  return options.create ? "create" : "skip";
}

/** "3 created · 2 updated", plus skipped and deleted counts when there are any. */
export function createdUpdatedSummary(
  job: Pick<MigrationJobStatus, "created" | "updated" | "skipped" | "deleted">,
): string {
  const parts = [`${job.created} created`, `${job.updated} updated`];
  if (job.skipped > 0) parts.push(`${job.skipped} skipped`);
  if (job.deleted > 0) parts.push(`${job.deleted} deleted`);
  return parts.join(" · ");
}

/**
 * What the migration does with all matching source records in the target, such
 * as "3 to create · 2 to update · 1 skipped". Null until the target has been checked.
 */
export function totalActionsSummary(
  options: MigrationOptions,
  count: number,
  existing: number | null,
): string | null {
  if (existing === null) return null;
  const missing = count - existing;
  const parts: string[] = [];
  if (options.create) parts.push(`${missing.toLocaleString()} to create`);
  if (options.update) parts.push(`${existing.toLocaleString()} to update`);
  const skipped = (options.create ? 0 : missing) + (options.update ? 0 : existing);
  if (skipped > 0) {
    const reason = options.create || options.update
      ? options.create
        ? "already in the target"
        : "not in the target"
      : "Create and Update are off";
    parts.push(`${skipped.toLocaleString()} skipped (${reason})`);
  }
  return parts.join(" · ");
}

/** What ticking Delete does, shown before it is turned on and while it is on. */
export const DELETE_EXPLANATION =
  "Delete removes records from the target. In each target, every record of this table whose ID is not " +
  "among the source records you migrate is deleted. The filter only chooses source records: target " +
  "records outside it are deleted too, even when the source has them. Deleted records cannot be restored from here.";
