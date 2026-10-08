import { memo } from "react";
import { Input, Tooltip, cn } from "../../../shared/ui";
import { draftProblem, originalValue, type Draft } from "../model/drafts";
import type { LabelRow } from "../model/types";

interface LabelCellProps {
  row: LabelRow;
  lcid: number;
  baseLcid: number;
  draft: Draft | undefined;
  ariaLabel: string;
  onEdit: (row: LabelRow, lcid: number, value: string) => void;
}

/** One language value of one label. Edits go to the tab's draft store, keyed by row key and LCID. */
export const LabelCell = memo(function LabelCell({ row, lcid, baseLcid, draft, ariaLabel, onEdit }: LabelCellProps) {
  const original = originalValue(row, lcid);

  if (row.readOnlyReason) {
    return (
      <Tooltip content={row.readOnlyReason}>
        <span
          tabIndex={0}
          aria-label={`${ariaLabel}: ${original || "empty"}. ${row.readOnlyReason}`}
          className="block w-[196px] truncate text-fg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          title={original || undefined}
        >
          {original || "—"}
        </span>
      </Tooltip>
    );
  }

  const value = draft ? draft.value : original;
  const problem = draft ? draftProblem(draft, baseLcid) : null;
  const error = problem ?? draft?.error ?? null;
  const input = (
    <Input
      aria-label={ariaLabel}
      aria-invalid={problem ? true : undefined}
      value={value}
      placeholder="—"
      title={value || undefined}
      onChange={(event) => onEdit(row, lcid, event.target.value)}
      className={cn(
        "w-[196px] py-1 text-sm",
        draft && !error ? "bg-accent-soft" : "",
        draft?.error && !problem ? "bg-danger-soft" : "",
        problem ? "border-danger" : "",
      )}
    />
  );

  // Always wrapped, so the input keeps focus when the cell becomes invalid while typing.
  return (
    <Tooltip content={error} disabled={!error}>
      {input}
    </Tooltip>
  );
});
