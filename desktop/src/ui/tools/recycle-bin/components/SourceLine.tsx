import { Button } from "../../../shared/ui";
import type { SourceLine as SourceLineText } from "../model/sourceChoice";
import type { Source } from "../model/types";

const SOURCE_LABELS: Record<Source, string> = { bin: "Recycle bin", audit: "Audit log" };

interface SourceLineProps {
  line: SourceLineText;
  sources: Source[];
  source: Source;
  onSourceChange: (source: Source) => void;
}

/**
 * Where the deleted records come from. A table that is in the recycle bin and also audited gets a switch,
 * so records deleted before the recycle bin was turned on can be found in the audit log.
 */
export function SourceLine({ line, sources, source, onSourceChange }: SourceLineProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-3 py-1.5"
      aria-label="Source"
    >
      {sources.length > 1 ? (
        <div role="group" aria-label="Search in" className="flex items-center gap-1">
          {sources.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={item === source ? "primary" : "secondary"}
              aria-pressed={item === source}
              onClick={() => onSourceChange(item)}
            >
              {SOURCE_LABELS[item]}
            </Button>
          ))}
        </div>
      ) : null}
      <span className="text-sm font-medium text-fg-strong">{line.label}</span>
      {line.notes.map((note) => (
        <span key={note} className="text-xs text-fg-muted">
          {note}
        </span>
      ))}
    </div>
  );
}
