import type { SourceLine as SourceLineText } from "../model/sourceChoice";

/** Where the deleted records come from: the recycle bin, or the audit log as the fallback. */
export function SourceLine({ line }: { line: SourceLineText }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line bg-surface px-3 py-1.5" aria-label="Source">
      <span className="text-sm font-medium text-fg-strong">{line.label}</span>
      {line.notes.map((note) => (
        <span key={note} className="text-xs text-fg-muted">
          {note}
        </span>
      ))}
    </div>
  );
}
