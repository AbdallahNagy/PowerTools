import type { RecycleTable, Source, StatusResponse } from "./types";

/** The sources a table can be searched in, recycle bin first. */
export function availableSources(table: RecycleTable | null | undefined): Source[] {
  if (!table) return [];
  const sources: Source[] = [];
  if (table.binEnabled) sources.push("bin");
  if (table.auditEnabled) sources.push("audit");
  return sources;
}

/**
 * The source to search: the preferred one when the table has it, otherwise the recycle bin when the table is
 * ready in it, otherwise the audit log when the table is audited.
 */
export function sourceFor(table: RecycleTable | null | undefined, preferred: Source = "bin"): Source | null {
  const sources = availableSources(table);
  return sources.includes(preferred) ? preferred : (sources[0] ?? null);
}

function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

export interface SourceLine {
  label: string;
  notes: string[];
}

/** The one line under the filter toolbar that says where deleted records come from. */
export function sourceLine(source: Source, table: RecycleTable, status: StatusResponse | undefined): SourceLine {
  if (source === "bin") {
    const retention = table.retentionDays ?? status?.bin.retentionDays ?? null;
    return {
      label: retention ? `Recycle bin, keeps records ${days(retention)}` : "Recycle bin",
      notes: [
        "Only records deleted after the recycle bin was turned on are listed.",
        "Date and user filters apply to the audit log only.",
      ],
    };
  }

  const retention = status?.audit.retentionDays ?? null;
  const notes = ["Only audited fields that had a value can be recovered."];
  if (status?.bin.state === "unavailable" && status.bin.reason) notes.push(`Recycle bin: ${status.bin.reason}`);
  else if (table.binEnabled) notes.push("Records that are still in the recycle bin are skipped when restoring.");
  else if (status?.bin.state === "enabled") notes.push("This table is not in the recycle bin.");
  else notes.push("The recycle bin is off in this environment.");
  return {
    label: retention ? `Audit log, keeps entries ${days(retention)}` : "Audit log",
    notes,
  };
}
